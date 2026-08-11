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

// Obiekt do przechowywania propozycji RP (id wiadomości -> lista chętnych)
const rpProposals = new Map();

// Słownik z dokładnymi danymi dla poszczególnych kodów alarmowych
const alarmCodesData = {
    niebieski: {
        title: '🔵 Kod Niebieski',
        desc: 'Brak ataku terrorystycznego – tylko testy / ćwiczenia.',
        color: 'Blue',
        channelName: 'kod-niebieski'
    },
    zielony: {
        title: '🟢 Kod Zielony',
        desc: 'Brak ataku terrorystycznego. Nic się nie dzieje, miasto działa normalnie.',
        color: 'Green',
        channelName: 'kod-zielony'
    },
    pomaranczowy: {
        title: '🟠 Kod Pomarańczowy',
        desc: 'Podejrzenie ataku terrorystycznego. Wyższa gotowość służb mundurowych.',
        color: 'Orange',
        channelName: 'kod-pomaranczowy'
    },
    czerwony: {
        title: '🔴 Kod Czerwony',
        desc: 'Wysokie ryzyko ataku terrorystycznego. Najwyższa gotowość służb.',
        color: 'Red',
        channelName: 'kod-czerwony'
    },
    czarny: {
        title: '⚫ Kod Czarny',
        desc: 'Atak terrorystyczny, potwierdzony atak. Wojsko może pojawić się na drogach.',
        color: 'DarkGrey',
        channelName: 'kod-czarny'
    },
    bialy: {
        title: '⚪ Kod Biały (Stan Wyjątkowy)',
        desc: 'Wojna / atak terrorystyczny – służby nie radzą sobie. Zakaz zbiórek, każdy obywatel ma być w domu lub w bunkrze.',
        color: 'White',
        channelName: 'kod-bialy'
    }
};

// === REJESTRACJA KOMEND SLASH ===
const commands = [
    new SlashCommandBuilder()
        .setName('komendy')
        .setDescription('Wyświetla pełną listę wszystkich dostępnych komend'),

    new SlashCommandBuilder()
        .setName('zapowiedz-sesji')
        .setDescription('Wysyła zapowiedź nadchodzącej oficjalnej sesji RP')
        .addStringOption(opt => opt.setName('godzina').setDescription('Godzina rozpoczęcia (np. 18:00)').setRequired(true))
        .addRoleOption(opt => opt.setName('ping').setDescription('Rola do oznaczenia').setRequired(false))
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages),

    new SlashCommandBuilder()
        .setName('sesja')
        .setDescription('Wysyła panel sterowania sesją z przyciskami (Start, Koniec, Przypomnij, Zaplanuj)')
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages),

    new SlashCommandBuilder()
        .setName('propozycja-rp')
        .setDescription('Proponuje szybką akcję RP z przyciskami wyboru dla chętnych')
        .addStringOption(opt => opt.setName('opis').setDescription('Co proponujesz zagrać?').setRequired(true)),

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
        .setDescription('Ogłasza alert RCB i zmienia nazwę wskazanego kanału alarmowego')
        .addStringOption(opt => opt.setName('kod').setDescription('Wybierz kod alarmowy').setRequired(true).addChoices(
            { name: '🔵 Kod Niebieski (Testy / Ćwiczenia)', value: 'niebieski' },
            { name: '🟢 Kod Zielony (Bezpiecznie / Normalnie)', value: 'zielony' },
            { name: '🟠 Kod Pomarańczowy (Podejrzenie Ataku)', value: 'pomaranczowy' },
            { name: '🔴 Kod Czerwony (Wysokie Ryzyko)', value: 'czerwony' },
            { name: '⚫ Kod Czarny (Potwierdzony Atak)', value: 'czarny' },
            { name: '⚪ Kod Biały (Stan Wyjątkowy / Wojna)', value: 'bialy' }
        ))
        .addStringOption(opt => opt.setName('dodatkowy_opis').setDescription('Dodatkowy opis sytuacji / instrukcje dla graczy').setRequired(false))
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

    // === NOWE KOMENDY ADM / ZARZĄDZANIE PERONALEM ===
    new SlashCommandBuilder()
        .setName('plus')
        .setDescription('Przyznaje plusa członkowi administracji')
        .addUserOption(opt => opt.setName('admin').setDescription('Członek administracji').setRequired(true))
        .addStringOption(opt => opt.setName('powod').setDescription('Powód przyznania plusa').setRequired(true))
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

    new SlashCommandBuilder()
        .setName('minus')
        .setDescription('Przyznaje minusa członkowi administracji')
        .addUserOption(opt => opt.setName('admin').setDescription('Członek administracji').setRequired(true))
        .addStringOption(opt => opt.setName('powod').setDescription('Powód przyznania minusa').setRequired(true))
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

    new SlashCommandBuilder()
        .setName('awans')
        .setDescription('Ogłasza awans członka administracji')
        .addUserOption(opt => opt.setName('admin').setDescription('Wybrana osoba').setRequired(true))
        .addStringOption(opt => opt.setName('stara_ranga').setDescription('Poprzednia ranga').setRequired(true))
        .addStringOption(opt => opt.setName('nowa_ranga').setDescription('Nowa ranga').setRequired(true))
        .addStringOption(opt => opt.setName('powod').setDescription('Powód awansu').setRequired(false))
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

    new SlashCommandBuilder()
        .setName('degrad')
        .setDescription('Ogłasza degradację członka administracji')
        .addUserOption(opt => opt.setName('admin').setDescription('Wybrana osoba').setRequired(true))
        .addStringOption(opt => opt.setName('stara_ranga').setDescription('Poprzednia ranga').setRequired(true))
        .addStringOption(opt => opt.setName('nowa_ranga').setDescription('Nowa ranga (lub usunięcie z zespoł)').setRequired(true))
        .addStringOption(opt => opt.setName('powod').setDescription('Powód degradacji').setRequired(true))
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

    new SlashCommandBuilder()
        .setName('skarga-adm')
        .setDescription('Składa skargę na członka administracji')
        .addUserOption(opt => opt.setName('admin').setDescription('Członek administracji, na którego składasz skargę').setRequired(true))
        .addStringOption(opt => opt.setName('opis').setDescription('Opis przewinienia / sytuacji').setRequired(true))
        .addStringOption(opt => opt.setName('dowody').setDescription('Link do dowodów (zrzuty ekranu, nagranie)').setRequired(true)),

    new SlashCommandBuilder()
        .setName('pochwala-adm')
        .setDescription('Składa pochwałę dla członka administracji')
        .addUserOption(opt => opt.setName('admin').setDescription('Członek administracji, którego chcesz pochwalić').setRequired(true))
        .addStringOption(opt => opt.setName('powod').setDescription('Za co chcesz pochwalić ten personel?').setRequired(true))
        .addStringOption(opt => opt.setName('opis').setDescription('Dodatkowy opis sytuacji (opcjonalnie)').setRequired(false))
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
                    { name: '🎮 Zarządzanie Sesją RP', value: '`/zapowiedz-sesji` - Zapowiedź sesji\n`/sesja` - Panel zarządzania' },
                    { name: '🎭 Szybkie Akcje i RP', value: '`/propozycja-rp`, `/me`, `/do`, `/try`, `/szukam-rp`' },
                    { name: '👑 Zarządzanie Kadrami Adm', value: '`/plus` - Przyznanie plusa\n`/minus` - Przyznanie minusa\n`/awans` - Ogłoszenie awansu\n`/degrad` - Ogłoszenie degradacji' },
                    { name: '📣 Zgłoszenia nt. Administracji', value: '`/skarga-adm` - Skarga na administratora\n`/pochwala-adm` - Pochwała administratora' },
                    { name: '🛡️ Moderacja i Narzędzia', value: '`/ban`, `/warn`, `/warny`, `/blacklist`, `/alert-rcb`' }
                )
                .setTimestamp();

            await interaction.reply({ embeds: [embed], ephemeral: true });
        }

        // === KOMENDY PLUS/MINUS/AWANS/DEGRAD ===
        if (commandName === 'plus') {
            const admin = interaction.options.getUser('admin');
            const reason = interaction.options.getString('powod');
            const embed = new EmbedBuilder()
                .setTitle('➕ OTRZYMANO PLUSA')
                .setDescription(`**Administrator:** <@${admin.id}>\n**Nadający:** <@${interaction.user.id}>\n**Powód:** ${reason}`)
                .setColor('Green')
                .setTimestamp();
            await interaction.reply({ embeds: [embed] });
        }

        if (commandName === 'minus') {
            const admin = interaction.options.getUser('admin');
            const reason = interaction.options.getString('powod');
            const embed = new EmbedBuilder()
                .setTitle('➖ OTRZYMANO MINUSA')
                .setDescription(`**Administrator:** <@${admin.id}>\n**Nadający:** <@${interaction.user.id}>\n**Powód:** ${reason}`)
                .setColor('Red')
                .setTimestamp();
            await interaction.reply({ embeds: [embed] });
        }

        if (commandName === 'awans') {
            const admin = interaction.options.getUser('admin');
            const oldRank = interaction.options.getString('stara_ranga');
            const newRank = interaction.options.getString('nowa_ranga');
            const reason = interaction.options.getString('powod') || 'Dobra praca i zaangażowanie w rozwój serwera.';
            const embed = new EmbedBuilder()
                .setTitle('🎉 OGŁOSZENIE AWANSU')
                .setDescription(`Gratulacje dla <@${admin.id}> za awans w strukturach administracji!`)
                .addFields(
                    { name: 'Stara ranga', value: oldRank, inline: true },
                    { name: 'Nowa ranga', value: newRank, inline: true },
                    { name: 'Powód', value: reason }
                )
                .setColor('Gold')
                .setTimestamp();
            await interaction.reply({ content: `<@${admin.id}>`, embeds: [embed] });
        }

        if (commandName === 'degrad') {
            const admin = interaction.options.getUser('admin');
            const oldRank = interaction.options.getString('stara_ranga');
            const newRank = interaction.options.getString('nowa_ranga');
            const reason = interaction.options.getString('powod');
            const embed = new EmbedBuilder()
                .setTitle('📉 OGŁOSZENIE DEGRADACJI')
                .setDescription(`Informujemy o zmianie rangi administratora <@${admin.id}>.`)
                .addFields(
                    { name: 'Dotychczasowa ranga', value: oldRank, inline: true },
                    { name: 'Nowa ranga / Status', value: newRank, inline: true },
                    { name: 'Powód', value: reason }
                )
                .setColor('DarkRed')
                .setTimestamp();
            await interaction.reply({ embeds: [embed] });
        }

        // === SKARGA I POCHWAŁA NA ADM ===
        if (commandName === 'skarga-adm') {
            const admin = interaction.options.getUser('admin');
            const desc = interaction.options.getString('opis');
            const proof = interaction.options.getString('dowody');

            const embed = new EmbedBuilder()
                .setTitle('⚖️ SKARGA NA CZŁONKA ADMINISTRACJI')
                .addFields(
                    { name: 'Zgłaszający', value: `<@${interaction.user.id}> (\`${interaction.user.id}\`)`, inline: true },
                    { name: 'Oskarżony Admin', value: `<@${admin.id}> (\`${admin.id}\`)`, inline: true },
                    { name: 'Opis sytuacji', value: desc },
                    { name: 'Dowody', value: proof }
                )
                .setColor('Red')
                .setFooter({ text: 'Zgłoszenie trafiło do weryfikacji przez Zarząd' })
                .setTimestamp();

            await interaction.reply({ content: '✅ Twoja skarga na członka administracji została pomyślnie wysłana i przekazana do Zarządu!', ephemeral: true });
            await interaction.channel.send({ embeds: [embed] });
        }

        if (commandName === 'pochwala-adm') {
            const admin = interaction.options.getUser('admin');
            const reason = interaction.options.getString('powod');
            const desc = interaction.options.getString('opis') || 'Brak dodatkowego opisu.';

            const embed = new EmbedBuilder()
                .setTitle('⭐ POCHWAŁA DLA CZŁONKA ADMINISTRACJI')
                .addFields(
                    { name: 'Chwalony Admin', value: `<@${admin.id}>`, inline: true },
                    { name: 'Wysyłający', value: `<@${interaction.user.id}>`, inline: true },
                    { name: 'Powód pochwały', value: reason },
                    { name: 'Szczegóły', value: desc }
                )
                .setColor('LuminousVividPink')
                .setTimestamp();

            await interaction.reply({ content: '✅ Dziękujemy! Pochwała dla członka administracji została opublikowana.', ephemeral: true });
            await interaction.channel.send({ embeds: [embed] });
        }

        // --- Pozostałe istniejące komendy ---
        if (commandName === 'propozycja-rp') {
            const desc = interaction.options.getString('opis');
            const embed = new EmbedBuilder()
                .setTitle('❓ PROPOZYCJA AKCJI RP')
                .setDescription(`**Założyciel:** <@${interaction.user.id}>\n\n**Opis propozycji:**\n${desc}\n\n**Chętni (0):**\nBrak`)
                .setColor('DarkVividPink')
                .setFooter({ text: 'Kliknij przycisk poniżej, aby zadeklarować udział!' })
                .setTimestamp();

            const row = new ActionRowBuilder().addComponents(
                new ButtonBuilder().setCustomId('prop_yes').setLabel('Będę').setStyle(ButtonStyle.Success).setEmoji('🟢'),
                new ButtonBuilder().setCustomId('prop_no').setLabel('Nie będę').setStyle(ButtonStyle.Danger).setEmoji('🔴'),
                new ButtonBuilder().setCustomId('prop_list').setLabel('Lista chętnych').setStyle(ButtonStyle.Secondary).setEmoji('📋')
            );

            const msg = await interaction.reply({ content: '@everyone Ktoś ma ochotę na RP?', embeds: [embed], components: [row], fetchReply: true });

            rpProposals.set(msg.id, { author: interaction.user.id, desc: desc, yes: new Set(), no: new Set() });
        }

        if (commandName === 'me') {
            const action = interaction.options.getString('akcja');
            const embed = new EmbedBuilder().setDescription(`*<@${interaction.user.id}> ${action}*`).setColor('#C2A2DA');
            await interaction.reply({ embeds: [embed] });
        }

        if (commandName === 'do') {
            const desc = interaction.options.getString('opis');
            const embed = new EmbedBuilder().setDescription(`**[DO]** ${desc} *((( <@${interaction.user.id}> )))*`).setColor('#FFB400');
            await interaction.reply({ embeds: [embed] });
        }

        if (commandName === 'try') {
            const action = interaction.options.getString('czynnoscc');
            const success = Math.random() < 0.5;
            const resultText = success ? '🟢 **[UDANE]**' : '🔴 **[NIEUDANE]**';
            const embed = new EmbedBuilder().setTitle(`🎲 Próba Akcji RP`).setDescription(`<@${interaction.user.id}> próbuje: *${action}*\n\nWynik: ${resultText}`).setColor(success ? 'Green' : 'Red');
            await interaction.reply({ embeds: [embed] });
        }

        if (commandName === 'szukam-rp') {
            const desc = interaction.options.getString('opis');
            const location = interaction.options.getString('miejsce') || 'Nieokreślone';
            const embed = new EmbedBuilder().setTitle('🎭 OGŁOSZENIE RP - CHĘTNI DO GRY').setDescription(`**Szukający:** <@${interaction.user.id}>\n\n**Opis / Pomysł na RP:**\n${desc}\n\n**Miejsce:** ${location}`).setColor('Purple').setTimestamp();
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

        if (commandName === 'sesja') {
            const embed = new EmbedBuilder().setTitle('⚙️ Panel Zarządzania Sesją RP').setDescription('Wybierz akcję z poniższych przycisków:').setColor('Blurple');
            const row = new ActionRowBuilder().addComponents(
                new ButtonBuilder().setCustomId('btn_sesja_start').setLabel('Start').setStyle(ButtonStyle.Success).setEmoji('🟢'),
                new ButtonBuilder().setCustomId('btn_sesja_koniec').setLabel('Koniec').setStyle(ButtonStyle.Danger).setEmoji('🔴'),
                new ButtonBuilder().setCustomId('btn_sesja_przypomnij').setLabel('Przypomnij').setStyle(ButtonStyle.Primary).setEmoji('🔔'),
                new ButtonBuilder().setCustomId('btn_sesja_zaplanuj').setLabel('Zaplanuj').setStyle(ButtonStyle.Secondary).setEmoji('📅')
            );
            await interaction.reply({ embeds: [embed], components: [row] });
        }

        if (commandName === 'ticket-panel') {
            const embed = new EmbedBuilder().setTitle('🏷️ Centrum Pomocy i Zgłoszeń').setDescription('Wybierz opcję z menu poniżej.').setColor('#2F3136');
            const selectMenu = new StringSelectMenuBuilder().setCustomId('ticket_select').setPlaceholder('Wybierz opcję...').addOptions([
                { label: 'Pytanie do administracji', value: 'pytanie_adm', emoji: '❓' },
                { label: 'Do Zarządu', value: 'do_zarzadu', emoji: '👑' },
                { label: 'Partnerstwo', value: 'partnerstwo', emoji: '🤝' },
                { label: 'Zgłoś gracza', value: 'zglos_gracza', emoji: '👤' },
                { label: 'Zgłoś administratora', value: 'zglos_adm', emoji: '🛡️' },
                { label: 'Zgłoś błąd', value: 'zglos_blad', emoji: '🐛' },
                { label: 'Podanie', value: 'podanie', emoji: '📝' },
            ]);
            await interaction.reply({ embeds: [embed], components: [new ActionRowBuilder().addComponents(selectMenu)] });
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
            const embed = new EmbedBuilder().setAuthor({ name: `${interaction.user.tag}`, iconURL: interaction.user.displayAvatarURL() }).setTitle('🐦 Twitter').setDescription(text).setColor('38A1F3').setTimestamp();
            await interaction.reply({ embeds: [embed] });
        }

        if (commandName === 'darkweb') {
            const text = interaction.options.getString('tresc');
            const embed = new EmbedBuilder().setTitle('🕵️ Darkweb Message').setDescription(text).setFooter({ text: 'Autor: Anonim' }).setColor('DarkButNotBlack').setTimestamp();
            await interaction.reply({ embeds: [embed] });
        }

        if (commandName === 'instagram') {
            const text = interaction.options.getString('tresc');
            const imageUrl = interaction.options.getString('image_url');
            const embed = new EmbedBuilder().setAuthor({ name: interaction.user.tag, iconURL: interaction.user.displayAvatarURL() }).setTitle('📸 Instagram').setDescription(text).setColor('E1306C').setTimestamp();
            if (imageUrl) embed.setImage(imageUrl);
            await interaction.reply({ embeds: [embed] });
        }

        if (commandName === 'alert-rcb') {
            const codeKey = interaction.options.getString('kod');
            const extraDesc = interaction.options.getString('dodatkowy_opis');
            const codeInfo = alarmCodesData[codeKey];

            const channel = interaction.guild.channels.cache.get(RCB_CHANNEL_ID);
            if (channel) {
                await channel.setName(codeInfo.channelName).catch(err => console.error(err));
            }

            let fullDescription = `**Zagrożenie:**\n${codeInfo.desc}`;
            if (extraDesc) {
                fullDescription += `\n\n**Dodatkowe informacje:**\n${extraDesc}`;
            }

            const embed = new EmbedBuilder()
                .setTitle(`🚨 ALERT RCB - ${codeInfo.title}`)
                .setDescription(fullDescription)
                .setColor(codeInfo.color)
                .setFooter({ text: 'Rządowe Centrum Bezpieczeństwa' })
                .setTimestamp();

            await interaction.reply({ content: '@everyone', embeds: [embed] });
        }
    }

    // 2. OBSŁUGA SELECT MENU (TICKETY)
    if (interaction.isStringSelectMenu()) {
        if (interaction.customId === 'ticket_select') {
            const selected = interaction.values[0];
            let pingRoles = selected === 'do_zarzadu' || selected === 'zglos_adm' ? [PING_ZARZAD] : [PING_ADM];
            if (selected === 'zglos_blad') pingRoles.push(PING_TECH);

            const ticketChannel = await interaction.guild.channels.create({
                name: `ticket-${interaction.user.username}`,
                type: ChannelType.GuildText,
                permissionOverwrites: [
                    { id: interaction.guild.id, deny: [PermissionFlagsBits.ViewChannel] },
                    { id: interaction.user.id, allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages] }
                ]
            });

            const embed = new EmbedBuilder().setTitle(`🎫 Ticket: ${selected}`).setDescription(`Witaj <@${interaction.user.id}>! Opisz szczegółowo swoją sprawę.`).setColor('Green');
            const closeBtn = new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId('close_ticket').setLabel('Zamknij Ticket').setStyle(ButtonStyle.Danger).setEmoji('🔒'));

            await ticketChannel.send({ content: `${pingRoles.map(id => `<@&${id}>`).join(' ')} <@${interaction.user.id}>`, embeds: [embed], components: [closeBtn] });
            await interaction.reply({ content: `✅ Ticket utworzony: ${ticketChannel}`, ephemeral: true });
        }
    }

    // 3. OBSŁUGA PRZYCISKÓW
    if (interaction.isButton()) {
        const { customId, message } = interaction;

        if (customId === 'prop_yes' || customId === 'prop_no' || customId === 'prop_list') {
            const proposal = rpProposals.get(message.id);
            if (!proposal) return interaction.reply({ content: '❌ Ta propozycja RP wygasła.', ephemeral: true });

            if (customId === 'prop_yes') {
                proposal.yes.add(interaction.user.id);
                proposal.no.delete(interaction.user.id);
            } else if (customId === 'prop_no') {
                proposal.no.add(interaction.user.id);
                proposal.yes.delete(interaction.user.id);
            } else if (customId === 'prop_list') {
                const yesList = proposal.yes.size > 0 ? Array.from(proposal.yes).map(id => `<@${id}>`).join(', ') : 'Brak';
                const noList = proposal.no.size > 0 ? Array.from(proposal.no).map(id => `<@${id}>`).join(', ') : 'Brak';
                return interaction.reply({
                    content: `📋 **Lista Deklaracji RP:**\n🟢 **Będą (${proposal.yes.size}):** ${yesList}\n🔴 **Nie będą (${proposal.no.size}):** ${noList}`,
                    ephemeral: true
                });
            }

            const updatedEmbed = EmbedBuilder.from(message.embeds[0])
                .setDescription(`**Założyciel:** <@${proposal.author}>\n\n**Opis propozycji:**\n${proposal.desc}\n\n**Chętni (${proposal.yes.size}):**\n${proposal.yes.size > 0 ? Array.from(proposal.yes).map(id => `<@${id}>`).join(', ') : 'Brak'}`);

            await interaction.update({ embeds: [updatedEmbed] });
        }

        if (customId === 'btn_sesja_start') {
            sessionData.active = true;
            const embed = new EmbedBuilder().setTitle('🚀 SESJA RP ZOSTAŁA URUCHOMIONA!').setDescription(`Prowadzący: <@${interaction.user.id}>\nMożna wchodzić na serwer!`).setColor('Green').setTimestamp();
            await interaction.reply({ content: '@everyone', embeds: [embed] });
        }

        if (customId === 'btn_sesja_koniec') {
            sessionData.active = false;
            const embed = new EmbedBuilder().setTitle('🛑 SESJA RP ZOSTAŁA ZAKOŃCZONA!').setDescription('Dziękujemy wszystkim za udział w dzisiejszej sesji.').setColor('Red').setTimestamp();
            await interaction.reply({ content: '@everyone', embeds: [embed] });
        }

        if (customId === 'btn_sesja_przypomnij') {
            const embed = new EmbedBuilder().setTitle('🔔 PRZYPOMNIENIE O SESJI RP').setDescription(`Sesja RP zbliża się wielkimi krokami!`).setColor('Yellow').setTimestamp();
            await interaction.reply({ content: '@everyone', embeds: [embed] });
        }

        if (customId === 'btn_sesja_zaplanuj') {
            await interaction.reply({ content: '📌 Użyj: `/zapowiedz-sesji godzina: [np. 18:00]`', ephemeral: true });
        }

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
