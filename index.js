const http = require('http');
const { 
    Client, 
    GatewayIntentBits, 
    SlashCommandBuilder, 
    PermissionFlagsBits, 
    EmbedBuilder, 
    ActionRowBuilder, 
    ButtonBuilder, 
    ButtonStyle, 
    ModalBuilder, 
    TextInputBuilder, 
    TextInputStyle,
    REST, 
    Routes 
} = require('discord.js');

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMembers,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.GuildBans
    ]
});

// === USTAWIENIA ID KANAŁÓW (Podmień na własne ID kanałów) ===
const LOGS_CHANNEL_ID = 'ID_KANALU_LOGOW';
const JOIN_LEAVE_CHANNEL_ID = 'ID_KANALU_PRZYLOTY_ODLOTY';
const ADM_TASKS_CHANNEL_ID = 'ID_KANALU_ZADAN_ADM';

// === PRZECHOWYWANIE DANYCH SESJI RP ===
let sessionData = {
    active: false,
    host: null,
    time: null,
    ping: null,
    members: new Set()
};

// === ANTY-NUKE ===
const banTracker = new Map();

client.on('guildBanAdd', async (ban) => {
    try {
        const fetchedLogs = await ban.guild.fetchAuditLogs({ limit: 1, type: 12 });
        const banLog = fetchedLogs.entries.first();
        if (!banLog) return;

        const { executor } = banLog;
        if (!executor || executor.bot) return;

        const now = Date.now();
        const userBans = banTracker.get(executor.id) || [];
        const recentBans = userBans.filter(timestamp => now - timestamp < 10000);
        recentBans.push(now);
        banTracker.set(executor.id, recentBans);

        if (recentBans.length >= 3) {
            const member = await ban.guild.members.fetch(executor.id).catch(() => null);
            if (member && member.bannable) {
                await member.ban({ reason: 'Anty-Nuke: Masowe banowanie użytkowników' });
                
                const logChan = ban.guild.channels.cache.get(LOGS_CHANNEL_ID);
                if (logChan) {
                    logChan.send(`🚨 **ANTY-NUKE**: Zbanowano administratora <@${executor.id}> za masowe banowanie!`);
                }
            }
        }
    } catch (err) {
        console.error('Błąd Anty-Nuke:', err);
    }
});

// === PRZYLOTY / ODLOTY ===
client.on('guildMemberAdd', (member) => {
    const channel = member.guild.channels.cache.get(JOIN_LEAVE_CHANNEL_ID);
    if (!channel) return;

    const embed = new EmbedBuilder()
        .setTitle('✈️ Nowy Przylot!')
        .setDescription(`Witaj <@${member.id}> na serwerze!\n\n**Obywatela ID to:** \`${member.id}\``)
        .setColor('Green')
        .setTimestamp();

    channel.send({ embeds: [embed] });
});

client.on('guildMemberRemove', (member) => {
    const channel = member.guild.channels.cache.get(JOIN_LEAVE_CHANNEL_ID);
    if (!channel) return;

    const embed = new EmbedBuilder()
        .setTitle('🛫 Odlot!')
        .setDescription(`Obywatel **${member.user.tag}** opuścił nasz serwer.\n\n**Obywatela ID to:** \`${member.id}\``)
        .setColor('Red')
        .setTimestamp();

    channel.send({ embeds: [embed] });
});

// === REJESTRACJA KOMEND SLASH ===
const commands = [
    new SlashCommandBuilder().setName('embed').setDescription('Wysyła ogłoszenie w Embed'),
    new SlashCommandBuilder().setName('zgloszenie').setDescription('Otwiera formularz zgłoszenia'),
    new SlashCommandBuilder().setName('licencja').setDescription('Wysyła wniosek o licencję'),
    new SlashCommandBuilder().setName('propozycja').setDescription('Składa propozycję na serwerze'),
    
    // === KOMENDY SESJI RP ===
    new SlashCommandBuilder()
        .setName('zapowiedz-sesji')
        .setDescription('Wysyła zapowiedź nadchodzącej sesji RP')
        .addStringOption(opt => opt.setName('godzina').setDescription('Godzina rozpoczęcia (np. 18:00)').setRequired(true))
        .addRoleOption(opt => opt.setName('ping').setDescription('Rola do oznaczenia').setRequired(false))
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages),

    new SlashCommandBuilder()
        .setName('sesja')
        .setDescription('Zarządzanie stanem sesji RP (start/stop)')
        .addStringOption(opt => opt.setName('akcja').setDescription('Wybierz akcję').setRequired(true).addChoices(
            { name: 'Start', value: 'start' },
            { name: 'Koniec', value: 'stop' }
        ))
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages),

    // === KOMENDY ADM / MODERACJA ===
    new SlashCommandBuilder()
        .setName('ban')
        .setDescription('Baniuje użytkownika')
        .addUserOption(opt => opt.setName('obywatel').setDescription('Wybierz użytkownika').setRequired(true))
        .addStringOption(opt => opt.setName('powod').setDescription('Powód').setRequired(false))
        .setDefaultMemberPermissions(PermissionFlagsBits.BanMembers),

    new SlashCommandBuilder()
        .setName('unban')
        .setDescription('Odbaniowuje użytkownika po ID')
        .addStringOption(opt => opt.setName('id').setDescription('ID użytkownika').setRequired(true))
        .setDefaultMemberPermissions(PermissionFlagsBits.BanMembers),

    new SlashCommandBuilder()
        .setName('panel-adm')
        .setDescription('Otwiera panel zarządzania administracją')
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

    new SlashCommandBuilder()
        .setName('mute')
        .setDescription('Wycisza obywatela')
        .addUserOption(opt => opt.setName('obywatel').setDescription('Wybierz obywatela').setRequired(true))
        .addIntegerOption(opt => opt.setName('czas').setDescription('Czas w minutach').setRequired(true))
        .addStringOption(opt => opt.setName('powod').setDescription('Powód wyciszenia').setRequired(false))
        .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers),

    new SlashCommandBuilder()
        .setName('wezwanie-rzadowy')
        .setDescription('Wysyła wezwanie na kanał rządowy')
        .addUserOption(opt => opt.setName('obywatel').setDescription('Wybierz obywatela').setRequired(true))
        .addStringOption(opt => opt.setName('powod').setDescription('Powód wezwania').setRequired(true))
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages),

    new SlashCommandBuilder()
        .setName('wezwanie-biuro')
        .setDescription('Wysyła wezwanie do biura administracji')
        .addUserOption(opt => opt.setName('obywatel').setDescription('Wybierz obywatela').setRequired(true))
        .addStringOption(opt => opt.setName('powod').setDescription('Powód wezwania').setRequired(true))
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages),

    new SlashCommandBuilder()
        .setName('zadanie-adm')
        .setDescription('Przydziela nowe zadanie dla administracji')
        .addStringOption(opt => opt.setName('tresc').setDescription('Treść zadania').setRequired(true))
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
];

// Funkcja pomocnicza do budowania panelu Sesji
function buildSessionEmbedAndButtons() {
    const embed = new EmbedBuilder()
        .setTitle('🎮 SESJA ROLEPLAY')
        .setColor(sessionData.active ? 'Green' : 'Orange')
        .addFields(
            { name: 'Status', value: sessionData.active ? '🟢 TRWA' : '⏳ ZAPOWIEDZIANA', inline: true },
            { name: 'Prowadzący', value: `<@${sessionData.host}>`, inline: true },
            { name: 'Godzina', value: sessionData.time, inline: true },
            { name: 'Zapisani Gracze', value: sessionData.members.size > 0 ? Array.from(sessionData.members).map(id => `<@${id}>`).join(', ') : 'Brak zapisanych osób' }
        )
        .setTimestamp();

    const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('sesja_join').setLabel('Będę').setStyle(ButtonStyle.Success),
        new ButtonBuilder().setCustomId('sesja_leave').setLabel('Nie będę').setStyle(ButtonStyle.Danger),
        new ButtonBuilder().setCustomId('sesja_list').setLabel('Lista obecności').setStyle(ButtonStyle.Secondary)
    );

    return { embeds: [embed], components: [row] };
}

// === OBSŁUGA INTERAKCJI ===
client.on('interactionCreate', async (interaction) => {
    // 1. Komendy Slash
    if (interaction.isChatInputCommand()) {
        const { commandName } = interaction;

        if (commandName === 'zapowiedz-sesji') {
            const time = interaction.options.getString('godzina');
            const role = interaction.options.getRole('ping');

            sessionData.active = false;
            sessionData.host = interaction.user.id;
            sessionData.time = time;
            sessionData.members.clear();

            const sessionContent = buildSessionEmbedAndButtons();
            const pingText = role ? `<@&${role.id}>` : '@everyone';

            await interaction.reply({ content: `📣 **ZAPOWIEDŹ SESJI RP** ${pingText}`, ...sessionContent });
        }

        if (commandName === 'sesja') {
            const action = interaction.options.getString('akcja');

            if (action === 'start') {
                sessionData.active = true;
                const embed = new EmbedBuilder()
                    .setTitle('🚀 SESJA RP ZOSTANIE WŁAŚNIE URUCHOMIONA!')
                    .setDescription(`Prowadzący: <@${interaction.user.id}>\nMożna wchodzić na serwer!`)
                    .setColor('Green')
                    .setTimestamp();

                await interaction.reply({ embeds: [embed] });
            } else if (action === 'stop') {
                sessionData.active = false;
                const embed = new EmbedBuilder()
                    .setTitle('🛑 SESJA RP ZOSTAŁA ZAKOŃCZONA!')
                    .setDescription('Dziękujemy wszystkim za udział w dzisiejszej sesji.')
                    .setColor('Red')
                    .setTimestamp();

                await interaction.reply({ embeds: [embed] });
            }
        }

        if (commandName === 'embed') {
            const modal = new ModalBuilder()
                .setCustomId('modal_embed')
                .setTitle('Tworzenie Ogłoszenia Embed');

            const titleInput = new TextInputBuilder()
                .setCustomId('embed_title')
                .setLabel('Tytuł ogłoszenia')
                .setStyle(TextInputStyle.Short)
                .setRequired(true);

            const descInput = new TextInputBuilder()
                .setCustomId('embed_desc')
                .setLabel('Treść ogłoszenia')
                .setStyle(TextInputStyle.Paragraph)
                .setRequired(true);

            modal.addComponents(
                new ActionRowBuilder().addComponents(titleInput),
                new ActionRowBuilder().addComponents(descInput)
            );

            await interaction.showModal(modal);
        }

        if (commandName === 'zgloszenie') {
            const modal = new ModalBuilder()
                .setCustomId('modal_zgloszenie')
                .setTitle('Formularz Zgłoszenia');

            const input = new TextInputBuilder()
                .setCustomId('text_zgloszenie')
                .setLabel('Opisz swój problem/zgłoszenie')
                .setStyle(TextInputStyle.Paragraph)
                .setRequired(true);

            modal.addComponents(new ActionRowBuilder().addComponents(input));
            await interaction.showModal(modal);
        }

        if (commandName === 'licencja') {
            const modal = new ModalBuilder()
                .setCustomId('modal_licencja')
                .setTitle('Wniosek o Licencję');

            const input = new TextInputBuilder()
                .setCustomId('text_licencja')
                .setLabel('Podaj rodzaj licencji i uzasadnienie')
                .setStyle(TextInputStyle.Paragraph)
                .setRequired(true);

            modal.addComponents(new ActionRowBuilder().addComponents(input));
            await interaction.showModal(modal);
        }

        if (commandName === 'propozycja') {
            const modal = new ModalBuilder()
                .setCustomId('modal_propozycja')
                .setTitle('Nowa Propozycja');

            const input = new TextInputBuilder()
                .setCustomId('text_propozycja')
                .setLabel('Opisz swoją propozycję')
                .setStyle(TextInputStyle.Paragraph)
                .setRequired(true);

            modal.addComponents(new ActionRowBuilder().addComponents(input));
            await interaction.showModal(modal);
        }

        if (commandName === 'panel-adm') {
            const embed = new EmbedBuilder()
                .setTitle('🛠️ Panel Administracyjny')
                .setDescription('Wybierz akcję z poniższych przycisków:')
                .setColor('DarkRed');

            const row = new ActionRowBuilder().addComponents(
                new ButtonBuilder().setCustomId('adm_status').setLabel('Status Bota').setStyle(ButtonStyle.Secondary)
            );

            await interaction.reply({ embeds: [embed], components: [row], ephemeral: true });
        }

        if (commandName === 'mute') {
            const target = interaction.options.getMember('obywatel');
            const duration = interaction.options.getInteger('czas');
            const reason = interaction.options.getString('powod') || 'Brak powodu';

            if (!target) return interaction.reply({ content: 'Nie znaleziono obywatela!', ephemeral: true });

            await target.timeout(duration * 60 * 1000, reason);

            await interaction.reply({
                content: `🤐 Wyciszono obywatela <@${target.id}>\n**Obywatela ID to:** \`${target.id}\` na **${duration}m**.\n**Powód:** ${reason}`
            });
        }

        if (commandName === 'wezwanie-rzadowy') {
            const target = interaction.options.getUser('obywatel');
            const reason = interaction.options.getString('powod');

            const embed = new EmbedBuilder()
                .setTitle('🏛️ WEZWANIE NA RZĄDOWY')
                .setDescription(`Obywatel: <@${target.id}>\n**Obywatela ID to:** \`${target.id}\`\n\n**Powód:** ${reason}\n\nProsimy o niezwłoczne stawienie się!`)
                .setColor('Gold')
                .setTimestamp();

            await interaction.reply({ content: `<@${target.id}>`, embeds: [embed] });
        }

        if (commandName === 'wezwanie-biuro') {
            const target = interaction.options.getUser('obywatel');
            const reason = interaction.options.getString('powod');

            const embed = new EmbedBuilder()
                .setTitle('🏢 WEZWANIE DO BIURA')
                .setDescription(`Obywatel: <@${target.id}>\n**Obywatela ID to:** \`${target.id}\`\n\n**Powód:** ${reason}\n\nStaw się w biurze administracji!`)
                .setColor('Blue')
                .setTimestamp();

            await interaction.reply({ content: `<@${target.id}>`, embeds: [embed] });
        }

        if (commandName === 'zadanie-adm') {
            const text = interaction.options.getString('tresc');
            const taskChan = interaction.guild.channels.cache.get(ADM_TASKS_CHANNEL_ID);

            if (!taskChan) return interaction.reply({ content: 'Nie ustawiono kanału zadań w kodzie!', ephemeral: true });

            const embed = new EmbedBuilder()
                .setTitle('📋 Nowe Zadanie Administracyjne')
                .setDescription(text)
                .setFooter({ text: `Zadanie dodane przez: ${interaction.user.tag}` })
                .setColor('Orange')
                .setTimestamp();

            await taskChan.send({ embeds: [embed] });
            await interaction.reply({ content: 'Zadanie zostało wysłane na kanał administracji.', ephemeral: true });
        }

        if (commandName === 'ban') {
            const user = interaction.options.getUser('obywatel');
            const reason = interaction.options.getString('powod') || 'Brak powodu';
            await interaction.guild.members.ban(user, { reason });
            await interaction.reply({ content: `⛔ Zbanowano <@${user.id}>\n**Obywatela ID to:** \`${user.id}\`` });
        }

        if (commandName === 'unban') {
            const userId = interaction.options.getString('id');
            await interaction.guild.members.unban(userId);
            await interaction.reply({ content: `✅ Odbaniowano użytkownika o ID: \`${userId}\`` });
        }
    }

    // 2. Obsługa Formularzy (ModalSubmit)
    if (interaction.isModalSubmit()) {
        if (interaction.customId === 'modal_embed') {
            const title = interaction.fields.getTextInputValue('embed_title');
            const desc = interaction.fields.getTextInputValue('embed_desc');

            const embed = new EmbedBuilder()
                .setTitle(title)
                .setDescription(desc)
                .setColor('Blue')
                .setTimestamp();

            await interaction.reply({ embeds: [embed] });
        }

        if (interaction.customId === 'modal_zgloszenie') {
            const text = interaction.fields.getTextInputValue('text_zgloszenie');
            await interaction.reply({ content: `✅ Pomyślnie wysłano zgłoszenie:\n>>> ${text}`, ephemeral: true });
        }

        if (interaction.customId === 'modal_licencja') {
            const text = interaction.fields.getTextInputValue('text_licencja');
            await interaction.reply({ content: `✅ Pomyślnie złożono wniosek o licencję:\n>>> ${text}`, ephemeral: true });
        }

        if (interaction.customId === 'modal_propozycja') {
            const text = interaction.fields.getTextInputValue('text_propozycja');
            const embed = new EmbedBuilder()
                .setTitle('💡 Nowa Propozycja')
                .setDescription(text)
                .setFooter({ text: `Propozycja od: ${interaction.user.tag}` })
                .setColor('Yellow')
                .setTimestamp();

            const msg = await interaction.reply({ embeds: [embed], fetchReply: true });
            await msg.react('👍');
            await msg.react('👎');
        }
    }

    // 3. Obsługa Przycisków (Sesja RP i Panel Adm)
    if (interaction.isButton()) {
        if (interaction.customId === 'sesja_join') {
            sessionData.members.add(interaction.user.id);
            const sessionContent = buildSessionEmbedAndButtons();
            await interaction.update(sessionContent);
        }

        if (interaction.customId === 'sesja_leave') {
            sessionData.members.delete(interaction.user.id);
            const sessionContent = buildSessionEmbedAndButtons();
            await interaction.update(sessionContent);
        }

        if (interaction.customId === 'sesja_list') {
            const list = sessionData.members.size > 0 
                ? Array.from(sessionData.members).map(id => `• <@${id}>`).join('\n')
                : 'Brak zapisanych osób.';

            await interaction.reply({ content: `📋 **Lista obecności na sesji:**\n${list}`, ephemeral: true });
        }

        if (interaction.customId === 'adm_status') {
            await interaction.reply({ content: '🟢 Bot działa stabilnie. System Anty-Nuke aktywny.', ephemeral: true });
        }
    }
});

// === LOGOWANIE I REJESTRACJA KOMEND ===
client.once('ready', async () => {
    console.log(`🤖 Bot jest gotowy! Zalogowano jako ${client.user.tag}`);

    const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_TOKEN);
    try {
        console.log('⏳ Rejestrowanie komend (globalnie)...');
        await rest.put(
            Routes.applicationCommands(client.application.id),
            { body: commands }
        );
        console.log('✅ Wszystkie komendy pomyślnie zarejestrowane!');
    } catch (error) {
        console.error('Błąd rejestracji komend:', error);
    }
});

// LOGOWANIE BOTA
client.login(process.env.DISCORD_TOKEN);

// SERWER HTTP DLA RENDER.COM
const PORT = process.env.PORT || 3000;
http.createServer((req, res) => {
    res.write("Bot dziala 24/7!");
    res.end();
}).listen(PORT, () => {
    console.log(`Nasłuchiwanie HTTP na porcie ${PORT}`);
});
