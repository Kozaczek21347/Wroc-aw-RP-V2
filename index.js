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
    StringSelectMenuBuilder,
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

// === STAŁE ID KANAŁÓW I RÓL ===
const RCB_CHANNEL_ID = '1510326956359422170';

// ID Ról Pingu w Ticketach
const PING_ADM = '1510326955260772364';
const PING_ZARZAD = '1510326955378085898';
const PING_TECH = '1510326955315040444';

// === BAZY DANYCH W PAMIĘCI (RAM) ===
const warnings = new Map();  
const blacklistAdm = new Map();
const blacklistBot = new Map();
const blacklistUser = new Map();

let sessionData = {
    active: false,
    host: null,
    time: null,
    members: new Set()
};

// === REJESTRACJA KOMEND SLASH ===
const commands = [
    new SlashCommandBuilder()
        .setName('komendy')
        .setDescription('Wyświetla pełną listę wszystkich dostępnych komend'),

    new SlashCommandBuilder()
        .setName('zapowiedz-sesji')
        .setDescription('Wysyła zapowiedź nadchodzącej sesji RP')
        .addStringOption(opt => opt.setName('godzina').setDescription('Godzina rozpoczęcia (np. 18:00)').setRequired(true))
        .addRoleOption(opt => opt.setName('ping').setDescription('Rola do oznaczenia').setRequired(false))
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages),

    new SlashCommandBuilder()
        .setName('sesja')
        .setDescription('Wysyła panel sterowania sesją z przyciskami (Start, Koniec, Przypomnij, Zaplanuj)')
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages),

    // === KOMENDY ODGRYWANIA RP (me, do, try) ===
    new SlashCommandBuilder()
        .setName('me')
        .setDescription('Opisuje czynność wykonywaną przez Twoją postać')
        .addStringOption(opt => opt.setName('akcja').setDescription('Treść czynności (np. wyciąga dowód osobisty)').setRequired(true)),

    new SlashCommandBuilder()
        .setName('do')
        .setDescription('Opisuje otoczenie lub stan sytuacji wokół Twojej postaci')
        .addStringOption(opt => opt.setName('opis').setDescription('Treść opisu (np. Na stole leży pusta teczka)').setRequired(true)),

    new SlashCommandBuilder()
        .setName('try')
        .setDescription('Wykonuje próbę podjęcia trudnej czynności (losowanie 50/50)')
        .addStringOption(opt => opt.setName('czynnoscc').setDescription('Co próbuje zrobić Twoja postać?').setRequired(true)),

    new SlashCommandBuilder()
        .setName('szukam-rp')
        .setDescription('Wysyła ogłoszenie, że szukasz osób do odgrywania Roleplay')
        .addStringOption(opt => opt.setName('opis').setDescription('Opis akcji / z kim chcesz zagrać RP').setRequired(true))
        .addStringOption(opt => opt.setName('miejsce').setDescription('Miejsce akcji RP').setRequired(false)),

    new SlashCommandBuilder()
        .setName('ticket-panel')
        .setDescription('Wysyła panel otwierania zgłoszeń (Ticketów)')
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

    new SlashCommandBuilder()
        .setName('ban')
        .setDescription('Zbanuj użytkownika')
        .addUserOption(opt => opt.setName('obywatel').setDescription('Wybierz użytkownika').setRequired(true))
        .addStringOption(opt => opt.setName('powod').setDescription('Powód').setRequired(false))
        .setDefaultMemberPermissions(PermissionFlagsBits.BanMembers),

    new SlashCommandBuilder()
        .setName('warn')
        .setDescription('Daj ostrzeżenie obywatelowi')
        .addUserOption(opt => opt.setName('obywatel').setDescription('Wybierz obywatela').setRequired(true))
        .addStringOption(opt => opt.setName('powod').setDescription('Powód ostrzeżenia').setRequired(true))
        .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers),

    new SlashCommandBuilder()
        .setName('warny')
        .setDescription('Sprawdź ostrzeżenia obywatela')
        .addUserOption(opt => opt.setName('obywatel').setDescription('Wybierz obywatela').setRequired(true)),

    new SlashCommandBuilder()
        .setName('blacklist')
        .setDescription('Zarządzanie Czarną Listą')
        .addStringOption(opt => opt.setName('typ').setDescription('Wybierz typ czarnej listy').setRequired(true).addChoices(
            { name: 'Administracja', value: 'adm' },
            { name: 'Bot', value: 'bot' },
            { name: 'Zwykły Gracza', value: 'user' }
        ))
        .addStringOption(opt => opt.setName('akcja').setDescription('Dodaj lub Usuń').setRequired(true).addChoices(
            { name: 'Dodaj', value: 'add' },
            { name: 'Usuń', value: 'remove' }
        ))
        .addUserOption(opt => opt.setName('obywatel').setDescription('Wybierz obywatela').setRequired(true))
        .addStringOption(opt => opt.setName('powod').setDescription('Powód (wymagane przy dodawaniu)').setRequired(false))
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

    new SlashCommandBuilder()
        .setName('wezwanie-rzadowy')
        .setDescription('Wysyła wezwanie na kanał rządowy')
        .addUserOption(opt => opt.setName('obywatel').setDescription('Wybierz obywatela').setRequired(true))
        .addStringOption(opt => opt.setName('powod').setDescription('Powód wezwania').setRequired(true))
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages),

    new SlashCommandBuilder()
        .setName('wezwanie-biuro')
        .setDescription('Wysyła wezwanie do Biura Zarządu')
        .addUserOption(opt => opt.setName('obywatel').setDescription('Wybierz obywatela').setRequired(true))
        .addStringOption(opt => opt.setName('powod').setDescription('Powód wezwania').setRequired(true))
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages),

    new SlashCommandBuilder()
        .setName('panel-adm')
        .setDescription('Otwiera panel zarządzania administracją')
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

    new SlashCommandBuilder()
        .setName('twitter')
        .setDescription('Wysyła post na Twitterze')
        .addStringOption(opt => opt.setName('tresc').setDescription('Treść posta').setRequired(true)),

    new SlashCommandBuilder()
        .setName('darkweb')
        .setDescription('Wysyła anonimową wiadomość w Darkwebie')
        .addStringOption(opt => opt.setName('tresc').setDescription('Treść wiadomości').setRequired(true)),

    new SlashCommandBuilder()
        .setName('instagram')
        .setDescription('Wysyła post na Instagramie')
        .addStringOption(opt => opt.setName('tresc').setDescription('Opis zdjęcia/posta').setRequired(true))
        .addStringOption(opt => opt.setName('image_url').setDescription('Link do zdjęcia (URL)').setRequired(false)),

    new SlashCommandBuilder()
        .setName('alert-rcb')
        .setDescription('Ogłasza alert RCB i zmienia kod alarmowy na kanale')
        .addStringOption(opt => opt.setName('kod').setDescription('Wybierz kod alarmowy').setRequired(true).addChoices(
            { name: '🟢 Kod Zielony (Bezpiecznie)', value: 'zielony' },
            { name: '🟡 Kod Żółty (Zagrożenie)', value: 'zolty' },
            { name: '🔴 Kod Czerwony (Wysokie Zagrożenie)', value: 'czerwony' },
            { name: '🖤 Kod Czarny (Stan Wyjątkowy)', value: 'czarny' }
        ))
        .addStringOption(opt => opt.setName('opis').setDescription('Opis sytuacji / zagrożenia').setRequired(true))
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
];

function buildSessionEmbedAndButtons() {
    const embed = new EmbedBuilder()
        .setTitle('🎮 SESJA ROLEPLAY')
        .setColor(sessionData.active ? 'Green' : 'Orange')
        .addFields(
            { name: 'Status', value: sessionData.active ? '🟢 TRWA' : '⏳ ZAPOWIEDZIANA / WSTRZYMANA', inline: true },
            { name: 'Prowadzący', value: sessionData.host ? `<@${sessionData.host}>` : 'Brak', inline: true },
            { name: 'Godzina', value: sessionData.time || 'Nieustalona', inline: true },
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

client.on('interactionCreate', async (interaction) => {
    // 1. KOMENDY SLASH
    if (interaction.isChatInputCommand()) {
        const { commandName } = interaction;

        if (commandName === 'komendy') {
            const embed = new EmbedBuilder()
                .setTitle('📜 Lista Komend Bota')
                .setColor('Blue')
                .addFields(
                    { name: '🎮 Zarządzanie Sesją RP', value: '`/zapowiedz-sesji` - Zapisy i zapowiedź sesji\n`/sesja` - Panel zarządzania (Start, Koniec, Przypomnij, Zaplanuj)' },
                    { name: '🎭 Odgrywanie Naracji RP', value: '`/me` - Opis akcji postaci\n`/do` - Opis otoczenia/sytuacji\n`/try` - Proba z wynikiem 50/50 (Udane/Nieudane)\n`/szukam-rp` - Ogłoszenie poszukiwania graczy' },
                    { name: '🎫 Ticket System', value: '`/ticket-panel` - Panel zgłoszeń z opcją Do Zarządu' },
                    { name: '🛡️ Moderacja & Administracja', value: '`/ban` - Banowanie graczy\n`/warn` - Ostrzeżenia\n`/warny` - Lista ostrzeżeń\n`/blacklist` - Czarna lista\n`/panel-adm` - Panel zarządzania' },
                    { name: '📢 Wezwania', value: '`/wezwanie-rzadowy` - Wezwanie na rządowy\n`/wezwanie-biuro` - Wezwanie do Biura Zarządu' },
                    { name: '📱 Social Media RP', value: '`/twitter` - Twitter\n`/darkweb` - Darkweb\n`/instagram` - Instagram' },
                    { name: '🚨 Systemy Bezpieczeństwa', value: '`/alert-rcb` - Wysyła alert i zmienia kod na kanale' }
                )
                .setTimestamp();

            await interaction.reply({ embeds: [embed], ephemeral: true });
        }

        // OBSŁUGA /ME, /DO, /TRY
        if (commandName === 'me') {
            const action = interaction.options.getString('akcja');
            const embed = new EmbedBuilder()
                .setDescription(`*<@${interaction.user.id}> ${action}*`)
                .setColor('#C2A2DA');
            await interaction.reply({ embeds: [embed] });
        }

        if (commandName === 'do') {
            const desc = interaction.options.getString('opis');
            const embed = new EmbedBuilder()
                .setDescription(`**[DO]** ${desc} *((( <@${interaction.user.id}> )))*`)
                .setColor('#FFB400');
            await interaction.reply({ embeds: [embed] });
        }

        if (commandName === 'try') {
            const action = interaction.options.getString('czynnoscc');
            const success = Math.random() < 0.5;
            const resultText = success ? '🟢 **[UDANE]**' : '🔴 **[NIEUDANE]**';
            const color = success ? 'Green' : 'Red';

            const embed = new EmbedBuilder()
                .setTitle(`🎲 Próba Akcji RP`)
                .setDescription(`<@${interaction.user.id}> próbuje: *${action}*\n\nWynik: ${resultText}`)
                .setColor(color);
            await interaction.reply({ embeds: [embed] });
        }

        if (commandName === 'szukam-rp') {
            const desc = interaction.options.getString('opis');
            const location = interaction.options.getString('miejsce') || 'Nieokreślone';

            const embed = new EmbedBuilder()
                .setTitle('🎭 OGŁOSZENIE RP - CHĘTNI DO GRY')
                .setDescription(`**Szukający:** <@${interaction.user.id}>\n\n**Opis / Pomysł na RP:**\n${desc}\n\n**Miejsce:** ${location}`)
                .setColor('Purple')
                .setFooter({ text: 'Odpisz tej osobie na PW lub na kanale, jeśli chcesz zagrać!' })
                .setTimestamp();

            await interaction.reply({ content: '@everyone Szukamy chętnych do Roleplay!', embeds: [embed] });
        }

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

        // PANEL Z PRZYCISKAMI /SESJA
        if (commandName === 'sesja') {
            const embed = new EmbedBuilder()
                .setTitle('⚙️ Panel Zarządzania Sesją RP')
                .setDescription('Wybierz akcję z poniższych przycisków, aby zmienić stan sesji RP:')
                .setColor('Blurple');

            const row = new ActionRowBuilder().addComponents(
                new ButtonBuilder().setCustomId('btn_sesja_start').setLabel('Start').setStyle(ButtonStyle.Success).setEmoji('🟢'),
                new ButtonBuilder().setCustomId('btn_sesja_koniec').setLabel('Koniec').setStyle(ButtonStyle.Danger).setEmoji('🔴'),
                new ButtonBuilder().setCustomId('btn_sesja_przypomnij').setLabel('Przypomnij').setStyle(ButtonStyle.Primary).setEmoji('🔔'),
                new ButtonBuilder().setCustomId('btn_sesja_zaplanuj').setLabel('Zaplanuj').setStyle(ButtonStyle.Secondary).setEmoji('📅')
            );

            await interaction.reply({ embeds: [embed], components: [row] });
        }

        // PANEL TICKETÓW
        if (commandName === 'ticket-panel') {
            const embed = new EmbedBuilder()
                .setTitle('🏷️ Centrum Pomocy i Zgłoszeń')
                .setDescription('Wybierz z poniższego menu temat sprawy, w której chcesz się skontaktować z administracją.')
                .setColor('#2F3136');

            const selectMenu = new StringSelectMenuBuilder()
                .setCustomId('ticket_select')
                .setPlaceholder('Wybierz opcję zgłoszenia...')
                .addOptions([
                    { label: 'Pytanie do administracji', value: 'pytanie_adm', emoji: '❓' },
                    { label: 'Do Zarządu', value: 'do_zarzadu', emoji: '👑' },
                    { label: 'Partnerstwo', value: 'partnerstwo', emoji: '🤝' },
                    { label: 'Zgłoś gracza', value: 'zglos_gracza', emoji: '👤' },
                    { label: 'Zgłoś administratora', value: 'zglos_adm', emoji: '🛡️' },
                    { label: 'Zgłoś błąd', value: 'zglos_blad', emoji: '🐛' },
                    { label: 'Podanie', value: 'podanie', emoji: '📝' },
                ]);

            const row = new ActionRowBuilder().addComponents(selectMenu);
            await interaction.reply({ embeds: [embed], components: [row] });
        }

        if (commandName === 'ban') {
            const user = interaction.options.getUser('obywatel');
            const reason = interaction.options.getString('powod') || 'Brak powodu';
            await interaction.guild.members.ban(user, { reason });
            await interaction.reply({ content: `⛔ Zbanowano <@${user.id}>\n**ID:** \`${user.id}\`` });
        }

        if (commandName === 'warn') {
            const user = interaction.options.getUser('obywatel');
            const reason = interaction.options.getString('powod');
            const userWarns = warnings.get(user.id) || [];
            userWarns.push({ reason, admin: interaction.user.id });
            warnings.set(user.id, userWarns);
            await interaction.reply({ content: `⚠️ Nadano ostrzeżenie dla <@${user.id}> (${userWarns.length})\n**Powód:** ${reason}` });
        }

        if (commandName === 'warny') {
            const user = interaction.options.getUser('obywatel');
            const userWarns = warnings.get(user.id) || [];
            if (userWarns.length === 0) return interaction.reply({ content: 'Brak ostrzeżeń.', ephemeral: true });
            const list = userWarns.map((w, i) => `${i + 1}. **Powód:** ${w.reason}`).join('\n');
            await interaction.reply({ content: `📋 Ostrzeżenia <@${user.id}>:\n${list}`, ephemeral: true });
        }

        if (commandName === 'blacklist') {
            const type = interaction.options.getString('typ');
            const action = interaction.options.getString('akcja');
            const user = interaction.options.getUser('obywatel');
            const reason = interaction.options.getString('powod') || 'Brak powodu';

            let targetMap = type === 'adm' ? blacklistAdm : (type === 'bot' ? blacklistBot : blacklistUser);

            if (action === 'add') {
                targetMap.set(user.id, { reason, admin: interaction.user.id });
                await interaction.reply({ content: `🔴 Dodano <@${user.id}> do Czarnej Listy (${type.toUpperCase()}).\n**Powód:** ${reason}` });
            } else {
                targetMap.delete(user.id);
                await interaction.reply({ content: `🟢 Usunięto <@${user.id}> z Czarnej Listy (${type.toUpperCase()}).` });
            }
        }

        if (commandName === 'wezwanie-rzadowy') {
            const target = interaction.options.getUser('obywatel');
            const reason = interaction.options.getString('powod');
            const embed = new EmbedBuilder().setTitle('🏛️ WEZWANIE NA RZĄDOWY').setDescription(`Obywatel: <@${target.id}>\n**Powód:** ${reason}`).setColor('Gold');
            await interaction.reply({ content: `<@${target.id}>`, embeds: [embed] });
        }

        if (commandName === 'wezwanie-biuro') {
            const target = interaction.options.getUser('obywatel');
            const reason = interaction.options.getString('powod');
            const embed = new EmbedBuilder().setTitle('🏢 WEZWANIE DO BIURA ZARZĄDU').setDescription(`Obywatel: <@${target.id}>\n**Powód:** ${reason}`).setColor('Blue');
            await interaction.reply({ content: `<@${target.id}>`, embeds: [embed] });
        }

        if (commandName === 'panel-adm') {
            const embed = new EmbedBuilder().setTitle('🛠️ Panel Administracyjny').setDescription('Wybierz akcję:').setColor('DarkRed');
            const row = new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId('adm_status').setLabel('Status Bota').setStyle(ButtonStyle.Secondary));
            await interaction.reply({ embeds: [embed], components: [row], ephemeral: true });
        }

        if (commandName === 'twitter') {
            const text = interaction.options.getString('tresc');
            const embed = new EmbedBuilder()
                .setAuthor({ name: `${interaction.user.tag} (@${interaction.user.username})`, iconURL: interaction.user.displayAvatarURL() })
                .setTitle('🐦 Twitter')
                .setDescription(text)
                .setColor('38A1F3')
                .setTimestamp();
            await interaction.reply({ embeds: [embed] });
        }

        if (commandName === 'darkweb') {
            const text = interaction.options.getString('tresc');
            const embed = new EmbedBuilder()
                .setTitle('🕵️ Darkweb Message')
                .setDescription(text)
                .setFooter({ text: 'Autor: Anonim' })
                .setColor('DarkButNotBlack')
                .setTimestamp();
            await interaction.reply({ embeds: [embed] });
        }

        if (commandName === 'instagram') {
            const text = interaction.options.getString('tresc');
            const imageUrl = interaction.options.getString('image_url');
            const embed = new EmbedBuilder()
                .setAuthor({ name: interaction.user.tag, iconURL: interaction.user.displayAvatarURL() })
                .setTitle('📸 Instagram')
                .setDescription(text)
                .setColor('E1306C')
                .setTimestamp();
            if (imageUrl) embed.setImage(imageUrl);
            await interaction.reply({ embeds: [embed] });
        }

        if (commandName === 'alert-rcb') {
            const code = interaction.options.getString('kod');
            const desc = interaction.options.getString('opis');

            const channel = interaction.guild.channels.cache.get(RCB_CHANNEL_ID);
            let color = 'Green';
            let codeName = '🟢 KOD ZIELONY';

            if (code === 'zolty') { color = 'Yellow'; codeName = '🟡 KOD ŻÓŁTY'; }
            if (code === 'czerwony') { color = 'Red'; codeName = '🔴 KOD CZERWONY'; }
            if (code === 'czarny') { color = 'DarkGrey'; codeName = '🖤 KOD CZARNY'; }

            if (channel) {
                await channel.setName(`kod-alarmowy-${code}`).catch(err => console.error('Błąd zmiany nazwy:', err));
            }

            const embed = new EmbedBuilder()
                .setTitle(`🚨 ALERT RCB - ${codeName}`)
                .setDescription(`**Opis zagrożenia:**\n${desc}`)
                .setColor(color)
                .setTimestamp();

            await interaction.reply({ content: '@everyone', embeds: [embed] });
        }
    }

    // 2. OBSŁUGA SELECT MENU (TICKETY)
    if (interaction.isStringSelectMenu()) {
        if (interaction.customId === 'ticket_select') {
            const selected = interaction.values[0];
            let pingRoles = [];
            let typeName = '';

            if (selected === 'pytanie_adm') {
                pingRoles = [PING_ADM];
                typeName = 'Pytanie do Administracji';
            } else if (selected === 'do_zarzadu') {
                pingRoles = [PING_ZARZAD];
                typeName = 'Sprawa do Zarządu';
            } else if (selected === 'partnerstwo') {
                pingRoles = [PING_ADM];
                typeName = 'Partnerstwo';
            } else if (selected === 'zglos_gracza') {
                pingRoles = [PING_ADM];
                typeName = 'Zgłoszenie Gracza';
            } else if (selected === 'zglos_adm') {
                pingRoles = [PING_ZARZAD];
                typeName = 'Zgłoszenie Administratora';
            } else if (selected === 'zglos_blad') {
                pingRoles = [PING_ZARZAD, PING_TECH];
                typeName = 'Zgłoszenie Błędu';
            } else if (selected === 'podanie') {
                pingRoles = [PING_ADM];
                typeName = 'Podanie';
            }

            const channelName = `ticket-${interaction.user.username}`;
            const ticketChannel = await interaction.guild.channels.create({
                name: channelName,
                type: ChannelType.GuildText,
                permissionOverwrites: [
                    { id: interaction.guild.id, deny: [PermissionFlagsBits.ViewChannel] },
                    { id: interaction.user.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages] }
                ]
            });

            const pingsText = `${pingRoles.map(id => `<@&${id}>`).join(' ')} <@${interaction.user.id}>`;

            const embed = new EmbedBuilder()
                .setTitle(`🎫 Ticket: ${typeName}`)
                .setDescription(`Witaj <@${interaction.user.id}>! Opisz szczegółowo swoją sprawę.\nZaraz pojawi się odpowiednia osoba.`)
                .setColor('Green');

            const closeBtn = new ActionRowBuilder().addComponents(
                new ButtonBuilder().setCustomId('close_ticket').setLabel('Zamknij Ticket').setStyle(ButtonStyle.Danger).setEmoji('🔒')
            );

            await ticketChannel.send({ content: pingsText, embeds: [embed], components: [closeBtn] });
            await interaction.reply({ content: `✅ Twój ticket został utworzony: ${ticketChannel}`, ephemeral: true });
        }
    }

    // 3. OBSŁUGA PRZYCISKÓW
    if (interaction.isButton()) {
        const { customId } = interaction;

        // Przyciski panelu /sesja
        if (customId === 'btn_sesja_start') {
            sessionData.active = true;
            const embed = new EmbedBuilder()
                .setTitle('🚀 SESJA RP ZOSTAŁA URUCHOMIONA!')
                .setDescription(`Prowadzący: <@${interaction.user.id}>\nMożna wchodzić na serwer!`)
                .setColor('Green')
                .setTimestamp();
            await interaction.reply({ content: '@everyone', embeds: [embed] });
        }

        if (customId === 'btn_sesja_koniec') {
            sessionData.active = false;
            const embed = new EmbedBuilder()
                .setTitle('🛑 SESJA RP ZOSTAŁA ZAKOŃCZONA!')
                .setDescription('Dziękujemy wszystkim za udział w dzisiejszej sesji.')
                .setColor('Red')
                .setTimestamp();
            await interaction.reply({ content: '@everyone', embeds: [embed] });
        }

        if (customId === 'btn_sesja_przypomnij') {
            const embed = new EmbedBuilder()
                .setTitle('🔔 PRZYPOMNIENIE O SESJI RP')
                .setDescription(`Sesja RP zbliża się wielkimi krokami!\nSzykujcie się do wejścia na serwer.`)
                .setColor('Yellow')
                .setTimestamp();
            await interaction.reply({ content: '@everyone', embeds: [embed] });
        }

        if (customId === 'btn_sesja_zaplanuj') {
            await interaction.reply({ 
                content: '📌 Aby zaplanować nową sesję i zebrać zapisy graczy, użyj komendy: `/zapowiedz-sesji godzina: [np. 18:00]`', 
                ephemeral: true 
            });
        }

        // Zapisy z /zapowiedz-sesji
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

        if (customId === 'close_ticket') {
            await interaction.reply('🔒 Zamknięcie ticketu za 5 sekund...');
            setTimeout(() => interaction.channel.delete().catch(() => {}), 5000);
        }

        if (customId === 'adm_status') {
            await interaction.reply({ content: '🟢 Bot działa bez przeszkód.', ephemeral: true });
        }
    }
});

client.once('ready', async () => {
    console.log(`🤖 Zalogowano jako ${client.user.tag}`);

    const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_TOKEN);
    try {
        console.log('⏳ Rejestracja komend slash...');
        await rest.put(
            Routes.applicationCommands(client.application.id),
            { body: commands }
        );
        console.log('✅ Wstawiono wszystkie komendy pomyślnie!');
    } catch (error) {
        console.error('Błąd przy dodawaniu komend:', error);
    }
});

client.login(process.env.DISCORD_TOKEN);

const PORT = process.env.PORT || 3000;
http.createServer((req, res) => {
    res.write("Bot dziala 24/7!");
    res.end();
}).listen(PORT, () => {
    console.log(`Port HTTP: ${PORT}`);
});
