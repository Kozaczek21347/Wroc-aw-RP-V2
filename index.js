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
    ChannelType,
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

// === USTAWIENIA ID KANAŁÓW I KATEGORII (Podmień na własne ID) ===
const LOGS_CHANNEL_ID = 'ID_KANALU_LOGOW';
const JOIN_LEAVE_CHANNEL_ID = 'ID_KANALU_PRZYLOTY_ODLOTY';
const ADM_TASKS_CHANNEL_ID = 'ID_KANALU_ZADAN_ADM';
const TICKETS_CATEGORY_ID = 'ID_KATEGORII_TICKETOW'; // ID kategorii, gdzie mają tworzyć się kanały ticketów

// === BAZY DANYCH W PAMIĘCI (RAM) ===
const warnings = new Map();  // Map<userId, Array<{reason, admin, date}>>
const blacklist = new Map(); // Map<userId, {reason, admin, date}>
const banTracker = new Map();

let sessionData = {
    active: false,
    host: null,
    time: null,
    members: new Set()
};

// === ANTY-NUKE ===
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
    // --- SESJA RP ---
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

    // --- SYSTEM TICKETÓW ---
    new SlashCommandBuilder()
        .setName('setup-ticket')
        .setDescription('Wysyła panel otwierania zgłoszeń (Ticketów)')
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

    // --- MODERACJA (Bany, Warny, Blacklist, Mute) ---
    new SlashCommandBuilder()
        .setName('ban')
        .setDescription('Zbanuj użytkownika')
        .addUserOption(opt => opt.setName('obywatel').setDescription('Wybierz użytkownika').setRequired(true))
        .addStringOption(opt => opt.setName('powod').setDescription('Powód').setRequired(false))
        .setDefaultMemberPermissions(PermissionFlagsBits.BanMembers),

    new SlashCommandBuilder()
        .setName('unban')
        .setDescription('Odbaniuj użytkownika po ID')
        .addStringOption(opt => opt.setName('id').setDescription('ID użytkownika').setRequired(true))
        .setDefaultMemberPermissions(PermissionFlagsBits.BanMembers),

    new SlashCommandBuilder()
        .setName('warn')
        .setDescription('Daj ostrzeżenie graczo-obywatelowi')
        .addUserOption(opt => opt.setName('obywatel').setDescription('Wybierz obywatela').setRequired(true))
        .addStringOption(opt => opt.setName('powod').setDescription('Powód ostrzeżenia').setRequired(true))
        .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers),

    new SlashCommandBuilder()
        .setName('warny')
        .setDescription('Sprawdź ostrzeżenia obywatela')
        .addUserOption(opt => opt.setName('obywatel').setDescription('Wybierz obywatela').setRequired(true)),

    new SlashCommandBuilder()
        .setName('clearwarns')
        .setDescription('Usuń wszystkie ostrzeżenia obywatela')
        .addUserOption(opt => opt.setName('obywatel').setDescription('Wybierz obywatela').setRequired(true))
        .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers),

    new SlashCommandBuilder()
        .setName('blacklist-add')
        .setDescription('Dodaj obywatela do Czarnej Listy')
        .addUserOption(opt => opt.setName('obywatel').setDescription('Wybierz obywatela').setRequired(true))
        .addStringOption(opt => opt.setName('powod').setDescription('Powód wpisu').setRequired(true))
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

    new SlashCommandBuilder()
        .setName('blacklist-remove')
        .setDescription('Usuń obywatela z Czarnej Listy')
        .addUserOption(opt => opt.setName('obywatel').setDescription('Wybierz obywatela').setRequired(true))
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

    new SlashCommandBuilder()
        .setName('mute')
        .setDescription('Wycisz obywatela')
        .addUserOption(opt => opt.setName('obywatel').setDescription('Wybierz obywatela').setRequired(true))
        .addIntegerOption(opt => opt.setName('czas').setDescription('Czas w minutach').setRequired(true))
        .addStringOption(opt => opt.setName('powod').setDescription('Powód wyciszenia').setRequired(false))
        .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers),

    // --- FORMULARZE I OGŁOSZENIA ---
    new SlashCommandBuilder().setName('embed').setDescription('Wysyła ogłoszenie w Embed'),
    new SlashCommandBuilder().setName('licencja').setDescription('Wysyła wniosek o licencję'),
    new SlashCommandBuilder().setName('propozycja').setDescription('Składa propozycję na serwerze'),

    // --- PANEL I WEZWANIA ---
    new SlashCommandBuilder()
        .setName('panel-adm')
        .setDescription('Otwiera panel zarządzania administracją')
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

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

// POMOCNICZA FUNKCJA WIDOKU SESJI RP
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
    // 1. KOMENDY SLASH
    if (interaction.isChatInputCommand()) {
        const { commandName } = interaction;

        // --- SESJA RP ---
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
                    .setTitle('🚀 SESJA RP ZOSTAŁA URUCHOMIONA!')
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

        // --- TICKETY ---
        if (commandName === 'setup-ticket') {
            const embed = new EmbedBuilder()
                .setTitle('🎫 CENTRUM POMOCY / TICKET')
                .setDescription('Kliknij poniższy przycisk, aby otworzyć prywatne zgłoszenie z Administracją.')
                .setColor('Blue');

            const row = new ActionRowBuilder().addComponents(
                new ButtonBuilder()
                    .setCustomId('open_ticket')
                    .setLabel('Otwórz Zgłoszenie')
                    .setEmoji('📩')
                    .setStyle(ButtonStyle.Primary)
            );

            await interaction.reply({ embeds: [embed], components: [row] });
        }

        // --- WARNY ---
        if (commandName === 'warn') {
            const user = interaction.options.getUser('obywatel');
            const reason = interaction.options.getString('powod');

            const userWarns = warnings.get(user.id) || [];
            userWarns.push({ reason, admin: interaction.user.id, date: new Date().toLocaleDateString() });
            warnings.set(user.id, userWarns);

            await interaction.reply({
                content: `⚠️ Nadano ostrzeżenie dla <@${user.id}>\n**Liczba ostrzeżeń:** ${userWarns.length}\n**Powód:** ${reason}`
            });
        }

        if (commandName === 'warny') {
            const user = interaction.options.getUser('obywatel');
            const userWarns = warnings.get(user.id) || [];

            if (userWarns.length === 0) {
                return interaction.reply({ content: `Obywatel <@${user.id}> nie posiada żadnych ostrzeżeń.`, ephemeral: true });
            }

            const list = userWarns.map((w, index) => `${index + 1}. **Powód:** ${w.reason} (Przez: <@${w.admin}>, Dnia: ${w.date})`).join('\n');
            await interaction.reply({ content: `📋 **Ostrzeżenia użytkownika <@${user.id}> (${userWarns.length}):**\n${list}`, ephemeral: true });
        }

        if (commandName === 'clearwarns') {
            const user = interaction.options.getUser('obywatel');
            warnings.delete(user.id);
            await interaction.reply({ content: `🧹 Usunięto wszystkie ostrzeżenia dla <@${user.id}>.` });
        }

        // --- BLACKLISTA ---
        if (commandName === 'blacklist-add') {
            const user = interaction.options.getUser('obywatel');
            const reason = interaction.options.getString('powod');

            blacklist.set(user.id, { reason, admin: interaction.user.id, date: new Date().toLocaleDateString() });

            await interaction.reply({
                content: `🔴 Dodano obywatela <@${user.id}> do **Czarnej Listy**!\n**Powód:** ${reason}`
            });
        }

        if (commandName === 'blacklist-remove') {
            const user = interaction.options.getUser('obywatel');
            if (!blacklist.has(user.id)) {
                return interaction.reply({ content: `Obywatel <@${user.id}> nie znajduje się na Czarnej Liście.`, ephemeral: true });
            }

            blacklist.delete(user.id);
            await interaction.reply({ content: `🟢 Usunięto obywatela <@${user.id}> z Czarnej Listy.` });
        }

        // --- MODERACJA BANY / MUTE ---
        if (commandName === 'ban') {
            const user = interaction.options.getUser('obywatel');
            const reason = interaction.options.getString('powod') || 'Brak powodu';
            await interaction.guild.members.ban(user, { reason });
            await interaction.reply({ content: `⛔ Zbanowano <@${user.id}>\n**Obywatela ID:** \`${user.id}\`` });
        }

        if (commandName === 'unban') {
            const userId = interaction.options.getString('id');
            await interaction.guild.members.unban(userId);
            await interaction.reply({ content: `✅ Odbaniowano użytkownika o ID: \`${userId}\`` });
        }

        if (commandName === 'mute') {
            const target = interaction.options.getMember('obywatel');
            const duration = interaction.options.getInteger('czas');
            const reason = interaction.options.getString('powod') || 'Brak powodu';

            if (!target) return interaction.reply({ content: 'Nie znaleziono obywatela!', ephemeral: true });

            await target.timeout(duration * 60 * 1000, reason);

            await interaction.reply({
                content: `🤐 Wyciszono obywatela <@${target.id}>\n**Obywatela ID:** \`${target.id}\` na **${duration}m**.\n**Powód:** ${reason}`
            });
        }

        // --- EMBED / LICENCJA / PROPOZYCJA ---
        if (commandName === 'embed') {
            const modal = new ModalBuilder()
                .setCustomId('modal_embed')
                .setTitle('Tworzenie Ogłoszenia Embed');

            const titleInput = new TextInputBuilder().setCustomId('embed_title').setLabel('Tytuł ogłoszenia').setStyle(TextInputStyle.Short).setRequired(true);
            const descInput = new TextInputBuilder().setCustomId('embed_desc').setLabel('Treść ogłoszenia').setStyle(TextInputStyle.Paragraph).setRequired(true);

            modal.addComponents(new ActionRowBuilder().addComponents(titleInput), new ActionRowBuilder().addComponents(descInput));
            await interaction.showModal(modal);
        }

        if (commandName === 'licencja') {
            const modal = new ModalBuilder().setCustomId('modal_licencja').setTitle('Wniosek o Licencję');
            const input = new TextInputBuilder().setCustomId('text_licencja').setLabel('Podaj rodzaj licencji i uzasadnienie').setStyle(TextInputStyle.Paragraph).setRequired(true);
            modal.addComponents(new ActionRowBuilder().addComponents(input));
            await interaction.showModal(modal);
        }

        if (commandName === 'propozycja') {
            const modal = new ModalBuilder().setCustomId('modal_propozycja').setTitle('Nowa Propozycja');
            const input = new TextInputBuilder().setCustomId('text_propozycja').setLabel('Opisz swoją propozycję').setStyle(TextInputStyle.Paragraph).setRequired(true);
            modal.addComponents(new ActionRowBuilder().addComponents(input));
            await interaction.showModal(modal);
        }

        // --- WEZWANIA / PANEL ADM / ZADANIA ---
        if (commandName === 'panel-adm') {
            const embed = new EmbedBuilder().setTitle('🛠️ Panel Administracyjny').setDescription('Wybierz akcję z poniższych przycisków:').setColor('DarkRed');
            const row = new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId('adm_status').setLabel('Status Bota').setStyle(ButtonStyle.Secondary));
            await interaction.reply({ embeds: [embed], components: [row], ephemeral: true });
        }

        if (commandName === 'wezwanie-rzadowy') {
            const target = interaction.options.getUser('obywatel');
            const reason = interaction.options.getString('powod');
            const embed = new EmbedBuilder().setTitle('🏛️ WEZWANIE NA RZĄDOWY').setDescription(`Obywatel: <@${target.id}>\n**ID:** \`${target.id}\`\n\n**Powód:** ${reason}\n\nProsimy o niezwłoczne stawienie się!`).setColor('Gold').setTimestamp();
            await interaction.reply({ content: `<@${target.id}>`, embeds: [embed] });
        }

        if (commandName === 'wezwanie-biuro') {
            const target = interaction.options.getUser('obywatel');
            const reason = interaction.options.getString('powod');
            const embed = new EmbedBuilder().setTitle('🏢 WEZWANIE DO BIURA').setDescription(`Obywatel: <@${target.id}>\n**ID:** \`${target.id}\`\n\n**Powód:** ${reason}\n\nStaw się w biurze administracji!`).setColor('Blue').setTimestamp();
            await interaction.reply({ content: `<@${target.id}>`, embeds: [embed] });
        }

        if (commandName === 'zadanie-adm') {
            const text = interaction.options.getString('tresc');
            const taskChan = interaction.guild.channels.cache.get(ADM_TASKS_CHANNEL_ID);
            if (!taskChan) return interaction.reply({ content: 'Nie ustawiono kanału zadań w kodzie!', ephemeral: true });

            const embed = new EmbedBuilder().setTitle('📋 Nowe Zadanie Administracyjne').setDescription(text).setFooter({ text: `Zadanie dodane przez: ${interaction.user.tag}` }).setColor('Orange').setTimestamp();
            await taskChan.send({ embeds: [embed] });
            await interaction.reply({ content: 'Zadanie zostało wysłane na kanał administracji.', ephemeral: true });
        }
    }

    // 2. OBSŁUGA PRZYCISKÓW (Sesja, Ticket, Zamknięcie Ticketu, Panel)
    if (interaction.isButton()) {
        const { customId } = interaction;

        // SESJA
        if (customId === 'sesja_join') {
            sessionData.members.add(interaction.user.id);
            await interaction.update(buildSessionEmbedAndButtons());
        }
        if (customId === 'sesja_leave') {
            sessionData.members.delete(interaction.user.id);
            await interaction.update(buildSessionEmbedAndButtons());
        }
        if (customId === 'sesja_list') {
            const list = sessionData.members.size > 0 ? Array.from(sessionData.members).map(id => `• <@${id}>`).join('\n') : 'Brak zapisanych osób.';
            await interaction.reply({ content: `📋 **Lista obecności:**\n${list}`, ephemeral: true });
        }

        // TICKET - OTWARCIE
        if (customId === 'open_ticket') {
            const channelName = `ticket-${interaction.user.username}`;
            
            const ticketChannel = await interaction.guild.channels.create({
                name: channelName,
                type: ChannelType.GuildText,
                parent: TICKETS_CATEGORY_ID !== 'ID_KATEGORII_TICKETOW' ? TICKETS_CATEGORY_ID : null,
                permissionOverwrites: [
                    { id: interaction.guild.id, deny: [PermissionFlagsBits.ViewChannel] },
                    { id: interaction.user.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages] }
                ]
            });

            const embed = new EmbedBuilder()
                .setTitle(`📩 Zgłoszenie użytkownika ${interaction.user.tag}`)
                .setDescription('Opisz swój problem. Administracja wkrótce odpowie.')
                .setColor('Green');

            const closeBtn = new ActionRowBuilder().addComponents(
                new ButtonBuilder().setCustomId('close_ticket').setLabel('Zamknij Ticket').setStyle(ButtonStyle.Danger).setEmoji('🔒')
            );

            await ticketChannel.send({ content: `<@${interaction.user.id}>`, embeds: [embed], components: [closeBtn] });
            await interaction.reply({ content: `✅ Stworzono zgłoszenie: ${ticketChannel}`, ephemeral: true });
        }

        // TICKET - ZAMKNIĘCIE
        if (customId === 'close_ticket') {
            await interaction.reply('🔒 Kanał zostanie usunięty za 5 sekund...');
            setTimeout(() => interaction.channel.delete().catch(() => {}), 5000);
        }

        if (customId === 'adm_status') {
            await interaction.reply({ content: '🟢 Bot działa stabilnie. System Anty-Nuke aktywny.', ephemeral: true });
        }
    }

    // 3. OBSŁUGA FORMULARZY (MODALE)
    if (interaction.isModalSubmit()) {
        if (interaction.customId === 'modal_embed') {
            const title = interaction.fields.getTextInputValue('embed_title');
            const desc = interaction.fields.getTextInputValue('embed_desc');
            const embed = new EmbedBuilder().setTitle(title).setDescription(desc).setColor('Blue').setTimestamp();
            await interaction.reply({ embeds: [embed] });
        }

        if (interaction.customId === 'modal_licencja') {
            const text = interaction.fields.getTextInputValue('text_licencja');
            await interaction.reply({ content: `✅ Pomyślnie złożono wniosek o licencję:\n>>> ${text}`, ephemeral: true });
        }

        if (interaction.customId === 'modal_propozycja') {
            const text = interaction.fields.getTextInputValue('text_propozycja');
            const embed = new EmbedBuilder().setTitle('💡 Nowa Propozycja').setDescription(text).setFooter({ text: `Propozycja od: ${interaction.user.tag}` }).setColor('Yellow').setTimestamp();
            const msg = await interaction.reply({ embeds: [embed], fetchReply: true });
            await msg.react('👍');
            await msg.react('👎');
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
