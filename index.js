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

// === OBSŁUGA INTERAKCJI ===
client.on('interactionCreate', async (interaction) => {
    if (interaction.isChatInputCommand()) {
        const { commandName } = interaction;

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

    if (interaction.isButton()) {
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
