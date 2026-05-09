import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ChannelType,
  Client,
  EmbedBuilder,
  Events,
  GatewayIntentBits,
  ModalBuilder,
  Partials,
  PermissionFlagsBits,
  REST,
  Routes,
  SlashCommandBuilder,
  StringSelectMenuBuilder,
  TextInputBuilder,
  TextInputStyle,
} from "discord.js";
import { discordTicketsDb } from "../db/discordTicketsDb.js";
import { getAllServerContexts, getServerContext, runWithServerContext } from "../serverContext.js";
import { getRuntimeContext, getRuntimeEnvSnapshot } from "../config.js";
import { findServerPlayerBySteamId, normalizeSteamId } from "../utils/playerLookup.js";

const botStates = new Map();

function getState(contextId) {
  if (!botStates.has(contextId)) {
    botStates.set(contextId, {
      contextId,
      status: "disabled",
      client: null,
      startedAt: null,
      lastError: "",
      commandsRegisteredAt: "",
      userTag: "",
    });
  }
  return botStates.get(contextId);
}

function cleanCommandName(value) {
  const name = String(value || "ticket").trim().toLowerCase().replace(/[^a-z0-9_-]+/g, "-").replace(/^-+|-+$/g, "");
  return name.slice(0, 32) || "ticket";
}

function cleanChannelPrefix(value) {
  const prefix = String(value || "ticket").trim().toLowerCase().replace(/[^a-z0-9-]+/g, "-").replace(/^-+|-+$/g, "");
  return prefix.slice(0, 40) || "ticket";
}

function getDiscordConfig() {
  const env = getRuntimeEnvSnapshot();
  const enabled = env.DISCORD_ENABLED === "1" || env.DISCORD_ENABLED === "true";
  const config = {
    enabled,
    token: String(env.DISCORD_BOT_TOKEN || "").trim(),
    clientId: String(env.DISCORD_CLIENT_ID || "").trim(),
    guildId: String(env.DISCORD_GUILD_ID || "").trim(),
    ticketCategoryId: String(env.DISCORD_TICKET_CATEGORY_ID || "").trim(),
    panelChannelId: String(env.DISCORD_TICKET_PANEL_CHANNEL_ID || "").trim(),
    staffRoleId: String(env.DISCORD_STAFF_ROLE_ID || "").trim(),
    logChannelId: String(env.DISCORD_LOG_CHANNEL_ID || "").trim(),
    commandName: cleanCommandName(env.DISCORD_COMMAND_NAME),
    channelPrefix: cleanChannelPrefix(env.DISCORD_TICKET_CHANNEL_PREFIX),
    messageContentIntent: env.DISCORD_MESSAGE_CONTENT_INTENT === "1" || env.DISCORD_MESSAGE_CONTENT_INTENT === "true",
  };

  const missing = [];
  if (enabled && !config.token) missing.push("DISCORD_BOT_TOKEN");
  if (enabled && !config.clientId) missing.push("DISCORD_CLIENT_ID");
  if (enabled && !config.guildId) missing.push("DISCORD_GUILD_ID");

  return { ...config, missing };
}

function ticketNumber(ticketId) {
  return String(ticketId).padStart(4, "0");
}

function ticketChannelName(config, ticket) {
  return `${config.channelPrefix}-${ticketNumber(ticket.id)}`.slice(0, 90);
}

function formatDiscordUsername(user) {
  return user?.tag || user?.globalName || user?.username || "";
}

function buildSupportButtons(ticketId) {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`sst_ticket_claim:${ticketId}`)
      .setLabel("Claim")
      .setStyle(ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId(`sst_ticket_close:${ticketId}`)
      .setLabel("Close")
      .setStyle(ButtonStyle.Danger)
  );
}

const ticketTypeOptions = [
  {
    label: "General Support",
    value: "general-support",
    description: "Questions, stuck characters, or general help",
  },
  {
    label: "Report Player",
    value: "report-player",
    description: "Report cheating, griefing, abuse, or rule breaks",
  },
  {
    label: "Compensation",
    value: "compensation",
    description: "Lost item, rollback, ATM, or donation issue",
  },
  {
    label: "Technical Issue",
    value: "technical-issue",
    description: "Connection, mod, crash, or launcher problem",
  },
  {
    label: "Other",
    value: "other",
    description: "Anything that does not fit the other choices",
  },
];

function ticketTypeLabel(value) {
  return ticketTypeOptions.find((option) => option.value === value)?.label || "Support";
}

function buildTicketPanelPayload(contextName) {
  const embed = new EmbedBuilder()
    .setTitle("Support")
    .setDescription([
      "Need help from the admin team? Select the closest ticket type below.",
      "",
      "You will be asked for your **Steam64 ID** so SST can link your ticket to the server player data.",
    ].join("\n"))
    .setColor(0x22c55e)
    .setFooter({ text: `${contextName || "SST"} ticket support` });

  const select = new StringSelectMenuBuilder()
    .setCustomId("sst_ticket_open_select")
    .setPlaceholder("Make a selection")
    .addOptions(ticketTypeOptions);

  return {
    embeds: [embed],
    components: [new ActionRowBuilder().addComponents(select)],
  };
}

function buildTicketEmbed(ticket, contextName) {
  const embed = new EmbedBuilder()
    .setTitle(`SST Support Ticket #${ticketNumber(ticket.id)}`)
    .setColor(0x2563eb)
    .setTimestamp(new Date(ticket.createdAt || Date.now()))
    .addFields(
      { name: "Steam ID", value: ticket.steamId, inline: true },
      { name: "Server", value: contextName || "SST Server", inline: true },
      { name: "Player Match", value: ticket.playerName || "No known player match yet", inline: true }
    );

  if (ticket.ticketType) {
    embed.addFields({ name: "Type", value: ticket.ticketType, inline: true });
  }

  if (ticket.subject) {
    embed.addFields({ name: "Subject", value: ticket.subject.slice(0, 1024), inline: false });
  }

  return embed;
}

function memberHasStaffAccess(interaction, config) {
  if (interaction.memberPermissions?.has(PermissionFlagsBits.ManageMessages)) {
    return true;
  }

  if (!config.staffRoleId) {
    return false;
  }

  const roles = interaction.member?.roles;
  if (Array.isArray(roles)) {
    return roles.includes(config.staffRoleId);
  }

  return Boolean(roles?.cache?.has(config.staffRoleId));
}

function buildTicketPermissions(guild, config, openerId, botUserId) {
  const overwrites = [
    {
      id: guild.id,
      deny: [PermissionFlagsBits.ViewChannel],
    },
    {
      id: openerId,
      allow: [
        PermissionFlagsBits.ViewChannel,
        PermissionFlagsBits.SendMessages,
        PermissionFlagsBits.ReadMessageHistory,
        PermissionFlagsBits.AttachFiles,
      ],
    },
  ];

  if (botUserId) {
    overwrites.push({
      id: botUserId,
      allow: [
        PermissionFlagsBits.ViewChannel,
        PermissionFlagsBits.SendMessages,
        PermissionFlagsBits.ManageChannels,
        PermissionFlagsBits.ReadMessageHistory,
      ],
    });
  }

  if (config.staffRoleId) {
    overwrites.push({
      id: config.staffRoleId,
      allow: [
        PermissionFlagsBits.ViewChannel,
        PermissionFlagsBits.SendMessages,
        PermissionFlagsBits.ManageMessages,
        PermissionFlagsBits.ReadMessageHistory,
        PermissionFlagsBits.AttachFiles,
      ],
    });
  }

  return overwrites;
}

function createSlashCommand(config) {
  return new SlashCommandBuilder()
    .setName(config.commandName)
    .setDescription("Open and manage SST support tickets")
    .addSubcommand((subcommand) =>
      subcommand
        .setName("open")
        .setDescription("Open a support ticket")
        .addStringOption((option) =>
          option
            .setName("steam_id")
            .setDescription("Your 17-digit Steam64 ID")
            .setMinLength(17)
            .setMaxLength(17)
            .setRequired(true)
        )
        .addStringOption((option) =>
          option
            .setName("subject")
            .setDescription("Short issue summary")
            .setMaxLength(160)
        )
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName("claim")
        .setDescription("Claim the current support ticket")
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName("close")
        .setDescription("Close the current support ticket")
        .addStringOption((option) =>
          option
            .setName("reason")
            .setDescription("Close reason")
            .setMaxLength(240)
        )
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName("status")
        .setDescription("Show the current support ticket status")
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName("panel")
        .setDescription("Post the public raise-ticket panel")
        .addChannelOption((option) =>
          option
            .setName("channel")
            .setDescription("Channel to post the panel in")
            .addChannelTypes(ChannelType.GuildText)
        )
    );
}

async function registerSlashCommands(config) {
  const rest = new REST({ version: "10" }).setToken(config.token);
  await rest.put(
    Routes.applicationGuildCommands(config.clientId, config.guildId),
    { body: [createSlashCommand(config).toJSON()] }
  );
}

async function createTicketFromInteraction(interaction, config, context, ticketInput) {
  await interaction.deferReply({ ephemeral: true });

  const steamId = normalizeSteamId(ticketInput.steamId);
  if (!steamId) {
    await interaction.editReply("Please provide a valid 17-digit Steam64 ID.");
    return;
  }

  const ticketType = String(ticketInput.ticketType || "Support").trim();
  const subject = String(ticketInput.subject || "").trim();
  const details = String(ticketInput.details || "").trim();
  const playerMatch = await findServerPlayerBySteamId(steamId);
  let ticket = discordTicketsDb.createTicket({
    subject: ticketType ? `${ticketType}: ${subject || "No subject"}` : subject,
    steamId,
    playerName: playerMatch.playerName || "",
    discordUserId: interaction.user.id,
    discordUsername: formatDiscordUsername(interaction.user),
    guildId: config.guildId,
  });

  const guild = interaction.guild || await interaction.client.guilds.fetch(config.guildId);
  const channel = await guild.channels.create({
    name: ticketChannelName(config, ticket),
    type: ChannelType.GuildText,
    parent: config.ticketCategoryId || undefined,
    topic: `SST ticket #${ticketNumber(ticket.id)} | Steam ID ${steamId}`,
    permissionOverwrites: buildTicketPermissions(guild, config, interaction.user.id, interaction.client.user?.id),
  });

  ticket = discordTicketsDb.setTicketChannel(ticket.id, channel.id);
  discordTicketsDb.addMessage({
    ticketId: ticket.id,
    authorType: "system",
    authorName: "SST",
    message: `Ticket opened for Steam ID ${steamId}${playerMatch.playerName ? ` (${playerMatch.playerName})` : ""}.`,
  });

  const mention = config.staffRoleId ? `<@&${config.staffRoleId}> ` : "";
  await channel.send({
    content: `${mention}<@${interaction.user.id}> thanks. Staff can use the buttons below or the SST dashboard to manage this ticket.`,
    embeds: [buildTicketEmbed({ ...ticket, ticketType }, context.name)],
    components: [buildSupportButtons(ticket.id)],
  });

  if (details) {
    discordTicketsDb.addMessage({
      ticketId: ticket.id,
      authorType: "discord",
      authorId: interaction.user.id,
      authorName: formatDiscordUsername(interaction.user),
      message: details,
    });

    await channel.send({
      content: `**${formatDiscordUsername(interaction.user)}:** ${details}`,
    });
  }

  await interaction.editReply(`Ticket #${ticketNumber(ticket.id)} created: ${channel}`);
}

async function handleTicketOpen(interaction, config, context) {
  await createTicketFromInteraction(interaction, config, context, {
    steamId: interaction.options.getString("steam_id", true),
    ticketType: "Support",
    subject: interaction.options.getString("subject") || "",
  });
}

async function handleTicketPanel(interaction, config, context) {
  if (!memberHasStaffAccess(interaction, config)) {
    await interaction.reply({ content: "Only support staff can publish the ticket panel.", ephemeral: true });
    return;
  }

  const targetChannel = interaction.options.getChannel("channel") || interaction.channel;
  if (!targetChannel?.isTextBased()) {
    await interaction.reply({ content: "Choose a text channel for the ticket panel.", ephemeral: true });
    return;
  }

  const panel = await publishTicketPanel({ channelId: targetChannel.id, context });
  await interaction.reply({
    content: `Ticket panel published in <#${panel.channelId}>.`,
    ephemeral: true,
  });
}

function ensureTicketChannel(interaction) {
  const ticket = discordTicketsDb.getTicketByChannelId(interaction.channelId);
  if (!ticket) {
    return null;
  }
  return ticket;
}

async function handleTicketClaim(interaction, config) {
  const ticket = ensureTicketChannel(interaction);
  if (!ticket) {
    await interaction.reply({ content: "This command must be used inside an SST ticket channel.", ephemeral: true });
    return;
  }

  if (!memberHasStaffAccess(interaction, config)) {
    await interaction.reply({ content: "Only support staff can claim tickets.", ephemeral: true });
    return;
  }

  const updatedTicket = discordTicketsDb.claimTicket(ticket.id, interaction.user.id, formatDiscordUsername(interaction.user));
  discordTicketsDb.addMessage({
    ticketId: ticket.id,
    authorType: "system",
    authorName: "SST",
    message: `${formatDiscordUsername(interaction.user)} claimed this ticket.`,
  });

  await interaction.reply(`Ticket #${ticketNumber(updatedTicket.id)} claimed by ${interaction.user}.`);
}

async function closeTicketChannel(channel, ticket) {
  try {
    await channel.permissionOverwrites.edit(ticket.discordUserId, {
      SendMessages: false,
    });
  } catch {
    // Channel permission changes can fail if the user left or the bot lacks Manage Channels.
  }

  if (channel?.name && !channel.name.startsWith("closed-")) {
    try {
      await channel.setName(`closed-${channel.name}`.slice(0, 90));
    } catch {
      // Renaming is best-effort.
    }
  }
}

async function handleTicketClose(interaction, config, reason = "") {
  const ticket = ensureTicketChannel(interaction);
  if (!ticket) {
    await interaction.reply({ content: "This command must be used inside an SST ticket channel.", ephemeral: true });
    return;
  }

  const isTicketOwner = ticket.discordUserId === interaction.user.id;
  if (!isTicketOwner && !memberHasStaffAccess(interaction, config)) {
    await interaction.reply({ content: "Only the ticket owner or support staff can close this ticket.", ephemeral: true });
    return;
  }

  const closeReason = String(reason || "Closed from Discord").trim();
  const updatedTicket = discordTicketsDb.closeTicket(ticket.id, interaction.user.id, formatDiscordUsername(interaction.user), closeReason);
  discordTicketsDb.addMessage({
    ticketId: ticket.id,
    authorType: "system",
    authorName: "SST",
    message: `Ticket closed by ${formatDiscordUsername(interaction.user)}. Reason: ${closeReason}`,
  });

  await closeTicketChannel(interaction.channel, ticket);
  await interaction.reply(`Ticket #${ticketNumber(updatedTicket.id)} closed. Reason: ${closeReason}`);
}

async function handleTicketStatus(interaction) {
  const ticket = ensureTicketChannel(interaction);
  if (!ticket) {
    await interaction.reply({ content: "This command must be used inside an SST ticket channel.", ephemeral: true });
    return;
  }

  await interaction.reply({
    content: `Ticket #${ticketNumber(ticket.id)} is ${ticket.status}. Steam ID: ${ticket.steamId}${ticket.playerName ? ` (${ticket.playerName})` : ""}.`,
    ephemeral: true,
  });
}

function buildTicketModal(ticketType) {
  return new ModalBuilder()
    .setCustomId(`sst_ticket_modal:${ticketType}`)
    .setTitle(`${ticketTypeLabel(ticketType)} Ticket`)
    .addComponents(
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId("steam_id")
          .setLabel("Steam64 ID")
          .setPlaceholder("7656119xxxxxxxxxx")
          .setStyle(TextInputStyle.Short)
          .setMinLength(17)
          .setMaxLength(17)
          .setRequired(true)
      ),
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId("subject")
          .setLabel("Short summary")
          .setPlaceholder("What do you need help with?")
          .setStyle(TextInputStyle.Short)
          .setMaxLength(160)
          .setRequired(true)
      ),
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId("details")
          .setLabel("Details")
          .setPlaceholder("Tell staff what happened, when it happened, and who was involved.")
          .setStyle(TextInputStyle.Paragraph)
          .setMaxLength(1000)
          .setRequired(false)
      )
    );
}

async function handlePanelSelect(interaction) {
  if (!interaction.isStringSelectMenu() || interaction.customId !== "sst_ticket_open_select") return false;
  const ticketType = interaction.values?.[0] || "general-support";
  await interaction.showModal(buildTicketModal(ticketType));
  return true;
}

async function handleTicketModal(interaction, config, context) {
  if (!interaction.isModalSubmit() || !interaction.customId.startsWith("sst_ticket_modal:")) return false;

  const ticketType = interaction.customId.split(":")[1] || "general-support";
  await createTicketFromInteraction(interaction, config, context, {
    steamId: interaction.fields.getTextInputValue("steam_id"),
    ticketType: ticketTypeLabel(ticketType),
    subject: interaction.fields.getTextInputValue("subject"),
    details: interaction.fields.getTextInputValue("details"),
  });
  return true;
}

async function handleCommandInteraction(interaction, config, context) {
  if (!interaction.isChatInputCommand() || interaction.commandName !== config.commandName) return;

  const subcommand = interaction.options.getSubcommand();
  if (subcommand === "open") {
    await handleTicketOpen(interaction, config, context);
  } else if (subcommand === "claim") {
    await handleTicketClaim(interaction, config);
  } else if (subcommand === "close") {
    await handleTicketClose(interaction, config, interaction.options.getString("reason") || "");
  } else if (subcommand === "status") {
    await handleTicketStatus(interaction);
  } else if (subcommand === "panel") {
    await handleTicketPanel(interaction, config, context);
  }
}

async function handleButtonInteraction(interaction, config) {
  if (!interaction.isButton()) return;

  const [action, rawTicketId] = interaction.customId.replace("sst_ticket_", "").split(":");
  if (!action || !rawTicketId) return;

  const ticket = discordTicketsDb.getTicketById(rawTicketId);
  if (!ticket || ticket.channelId !== interaction.channelId) {
    await interaction.reply({ content: "This ticket could not be found.", ephemeral: true });
    return;
  }

  if (action === "claim") {
    await handleTicketClaim(interaction, config);
  } else if (action === "close") {
    await handleTicketClose(interaction, config, "Closed from Discord");
  }
}

function messageText(message) {
  const content = String(message.content || "").trim();
  const attachments = [...message.attachments.values()].map((attachment) => attachment.url).filter(Boolean);
  return [content, ...attachments].filter(Boolean).join("\n");
}

function attachDiscordHandlers(client, config, context) {
  client.once(Events.ClientReady, (readyClient) => {
    const state = getState(context.id);
    state.status = "ready";
    state.startedAt = new Date().toISOString();
    state.userTag = readyClient.user?.tag || "";
    state.lastError = "";
    console.log(`[Discord:${context.id}] Bot connected as ${state.userTag}.`);

    if (config.panelChannelId) {
      publishTicketPanel({ channelId: config.panelChannelId, context }).catch((err) => {
        console.warn(`[Discord:${context.id}] Ticket panel publish failed: ${err?.message || err}`);
      });
    }
  });

  client.on(Events.InteractionCreate, async (interaction) => {
    await runWithServerContext(context, async () => {
      try {
        await handleCommandInteraction(interaction, config, context);
        await handlePanelSelect(interaction);
        await handleTicketModal(interaction, config, context);
        await handleButtonInteraction(interaction, config);
      } catch (err) {
        console.error(`[Discord:${context.id}] Interaction failed:`, err?.message || err);
        if (interaction.isRepliable() && !interaction.replied && !interaction.deferred) {
          await interaction.reply({ content: "SST could not process that Discord action.", ephemeral: true }).catch(() => {});
        } else if (interaction.isRepliable()) {
          await interaction.followUp({ content: "SST could not process that Discord action.", ephemeral: true }).catch(() => {});
        }
      }
    });
  });

  client.on(Events.MessageCreate, async (message) => {
    if (message.author?.bot) return;

    await runWithServerContext(context, async () => {
      const ticket = discordTicketsDb.getTicketByChannelId(message.channelId);
      if (!ticket || ticket.status !== "open") return;

      const text = messageText(message);
      if (!text) return;

      discordTicketsDb.addMessage({
        ticketId: ticket.id,
        authorType: "discord",
        authorId: message.author.id,
        authorName: formatDiscordUsername(message.author),
        message: text,
        discordMessageId: message.id,
      });
    });
  });

  client.on(Events.Error, (err) => {
    const state = getState(context.id);
    state.status = "error";
    state.lastError = err?.message || String(err);
    console.error(`[Discord:${context.id}] Client error:`, state.lastError);
  });
}

async function startDiscordBotForContext(context) {
  return runWithServerContext(context, async () => {
    const config = getDiscordConfig();
    const state = getState(context.id);

    if (!config.enabled) {
      state.status = "disabled";
      state.lastError = "";
      return state;
    }

    if (config.missing.length > 0) {
      state.status = "misconfigured";
      state.lastError = `Missing ${config.missing.join(", ")}`;
      console.warn(`[Discord:${context.id}] ${state.lastError}.`);
      return state;
    }

    if (state.status === "ready" || state.status === "starting") {
      return state;
    }

    state.status = "starting";
    state.lastError = "";

    try {
      await registerSlashCommands(config);
      state.commandsRegisteredAt = new Date().toISOString();

      const intents = [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
      ];

      if (config.messageContentIntent) {
        intents.push(GatewayIntentBits.MessageContent);
      }

      const client = new Client({
        intents,
        partials: [Partials.Channel],
      });

      state.client = client;
      attachDiscordHandlers(client, config, context);
      await client.login(config.token);
      return state;
    } catch (err) {
      state.status = "error";
      state.lastError = err?.message || String(err);
      console.error(`[Discord:${context.id}] Startup failed:`, state.lastError);
      return state;
    }
  });
}

export async function startDiscordBots() {
  for (const context of getAllServerContexts()) {
    await startDiscordBotForContext(context);
  }
}

export function getDiscordBotStatus() {
  const context = getRuntimeContext();
  const config = getDiscordConfig();
  const state = getState(context.id);

  return {
    contextId: context.id,
    contextName: context.name,
    enabled: config.enabled,
    status: state.status,
    userTag: state.userTag,
    startedAt: state.startedAt,
    commandsRegisteredAt: state.commandsRegisteredAt,
    lastError: state.lastError,
    commandName: config.commandName,
    ticketCategoryId: config.ticketCategoryId,
    panelChannelId: config.panelChannelId,
    panel: discordTicketsDb.getPanel(),
    staffRoleId: config.staffRoleId,
    logChannelId: config.logChannelId,
    missing: config.missing,
    messageContentIntentNeeded: false,
    messageContentIntentEnabled: config.messageContentIntent,
  };
}

async function getTicketChannel(ticket) {
  const contextId = getServerContext()?.id || "default";
  const state = getState(contextId);
  if (!state.client || state.status !== "ready" || !ticket.channelId) {
    return null;
  }

  try {
    return await state.client.channels.fetch(ticket.channelId);
  } catch {
    return null;
  }
}

async function getBotChannel(channelId, contextId = getServerContext()?.id || "default") {
  const state = getState(contextId);
  if (!state.client || state.status !== "ready") {
    throw new Error("Discord bot is not ready.");
  }

  const channel = await state.client.channels.fetch(channelId);
  if (!channel?.isTextBased()) {
    throw new Error("Ticket panel channel must be a text channel.");
  }

  return channel;
}

export async function publishTicketPanel({ channelId, context = getRuntimeContext() } = {}) {
  const config = await runWithServerContext(context, () => getDiscordConfig());
  const targetChannelId = String(channelId || config.panelChannelId || "").trim();
  if (!targetChannelId) {
    throw new Error("DISCORD_TICKET_PANEL_CHANNEL_ID is required.");
  }

  return runWithServerContext(context, async () => {
    const channel = await getBotChannel(targetChannelId, context.id);
    const payload = buildTicketPanelPayload(context.name);
    const currentPanel = discordTicketsDb.getPanel();
    let message = null;

    if (currentPanel?.messageId && currentPanel.channelId === targetChannelId) {
      try {
        message = await channel.messages.fetch(currentPanel.messageId);
        await message.edit(payload);
      } catch {
        message = null;
      }
    }

    if (!message) {
      message = await channel.send(payload);
    }

    return discordTicketsDb.savePanel(channel.id, message.id);
  });
}

export async function sendTicketReply(ticketId, message, adminName = "SST Admin") {
  const ticket = discordTicketsDb.getTicketById(ticketId);
  if (!ticket) {
    throw new Error("Ticket not found.");
  }

  if (ticket.status !== "open") {
    throw new Error("Ticket is closed.");
  }

  const body = String(message || "").trim();
  if (!body) {
    throw new Error("Reply message is required.");
  }

  discordTicketsDb.addMessage({
    ticketId: ticket.id,
    authorType: "admin",
    authorName: adminName,
    message: body,
  });

  const channel = await getTicketChannel(ticket);
  if (channel?.isTextBased()) {
    await channel.send(`**${adminName}:** ${body}`);
  }

  return discordTicketsDb.getTicketById(ticket.id);
}

export async function claimTicketFromDashboard(ticketId, adminId, adminName) {
  const ticket = discordTicketsDb.getTicketById(ticketId);
  if (!ticket) {
    throw new Error("Ticket not found.");
  }

  if (ticket.status !== "open") {
    throw new Error("Ticket is closed.");
  }

  const updatedTicket = discordTicketsDb.claimTicket(ticket.id, String(adminId || ""), adminName || "SST Admin");
  discordTicketsDb.addMessage({
    ticketId: ticket.id,
    authorType: "system",
    authorName: "SST",
    message: `${adminName || "SST Admin"} claimed this ticket from the dashboard.`,
  });

  const channel = await getTicketChannel(ticket);
  if (channel?.isTextBased()) {
    await channel.send(`**SST:** ${adminName || "SST Admin"} claimed this ticket from the dashboard.`);
  }

  return updatedTicket;
}

export async function closeTicketFromDashboard(ticketId, adminId, adminName, reason = "") {
  const ticket = discordTicketsDb.getTicketById(ticketId);
  if (!ticket) {
    throw new Error("Ticket not found.");
  }

  const closeReason = String(reason || "Closed from SST dashboard").trim();
  const updatedTicket = discordTicketsDb.closeTicket(ticket.id, String(adminId || ""), adminName || "SST Admin", closeReason);
  discordTicketsDb.addMessage({
    ticketId: ticket.id,
    authorType: "system",
    authorName: "SST",
    message: `Ticket closed from the dashboard by ${adminName || "SST Admin"}. Reason: ${closeReason}`,
  });

  const channel = await getTicketChannel(ticket);
  if (channel?.isTextBased()) {
    await channel.send(`**SST:** Ticket closed by ${adminName || "SST Admin"}. Reason: ${closeReason}`);
    await closeTicketChannel(channel, ticket);
  }

  return updatedTicket;
}
