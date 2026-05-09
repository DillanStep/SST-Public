import { Router } from "express";
import { mkdir, readFile, readdir, stat, unlink, writeFile } from "../storage/fs.js";
import { features, paths } from "../config.js";
import { joinStoragePath } from "../utils/storagePath.js";

const router = Router();

const QUEST_CONFIG_VERSION = 22;
const OBJECTIVE_CONFIG_VERSION = 28;
const NPC_CONFIG_VERSION = 6;

const OBJECTIVE_TYPES = {
  2: { key: "target", label: "Target / Kill", folder: "Target", prefix: "Objective_TA" },
  3: { key: "travel", label: "Travel", folder: "Travel", prefix: "Objective_T" },
  4: { key: "collection", label: "Collection", folder: "Collection", prefix: "Objective_C" },
  5: { key: "delivery", label: "Delivery", folder: "Delivery", prefix: "Objective_D" },
  6: { key: "treasure", label: "Treasure Hunt", folder: "TreasureHunt", prefix: "Objective_TH" },
  7: { key: "ai-patrol", label: "AI Patrol", folder: "AIPatrol", prefix: "Objective_AIP" },
  8: { key: "ai-camp", label: "AI Camp", folder: "AICamp", prefix: "Objective_AIC" },
  9: { key: "ai-vip", label: "AI VIP Escort", folder: "AIVIP", prefix: "Objective_AIESCORT" },
  10: { key: "action", label: "Action", folder: "Action", prefix: "Objective_A" },
  11: { key: "crafting", label: "Crafting", folder: "Crafting", prefix: "Objective_CR" },
};

const DEFAULT_OBJECTIVE_TYPE = 3;

function requireExpansion(_req, res, next) {
  if (!features.expansionEnabled) {
    return res.status(404).json({
      error: "Expansion mod features are disabled",
      code: "EXPANSION_DISABLED",
      hint: "Set EXPANSION_ENABLED=1 in your .env file to enable Expansion quest tools",
    });
  }

  next();
}

router.use(requireExpansion);

function isNotFound(err) {
  const code = String(err?.code || "").toUpperCase();
  const message = String(err?.message || "").toLowerCase();
  return code === "ENOENT" || message.includes("no such file") || message.includes("not found");
}

function asString(value) {
  return typeof value === "string" ? value.trim() : "";
}

function parseJson(raw, fallback = null) {
  try {
    return JSON.parse(raw);
  } catch {
    return fallback;
  }
}

function getStatIso(fileStat) {
  const modifiedAt = fileStat?.mtimeMs ?? (fileStat?.mtime ? new Date(fileStat.mtime).getTime() : null);
  return Number.isFinite(modifiedAt) ? new Date(modifiedAt).toISOString() : null;
}

function sanitizeFileName(fileName) {
  const clean = asString(fileName);
  if (!clean || clean.includes("/") || clean.includes("\\") || clean.includes("..")) {
    throw new Error("Invalid file name");
  }
  if (!clean.toLowerCase().endsWith(".json")) {
    throw new Error("File name must end with .json");
  }
  return clean;
}

function positiveInt(value, fallback = 1) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? Math.trunc(number) : fallback;
}

function normalizeNumberArray(value, fallback) {
  if (!Array.isArray(value)) return [...fallback];
  return fallback.map((item, index) => {
    const number = Number(value[index]);
    return Number.isFinite(number) ? number : item;
  });
}

function cleanSummaryText(value, fallback = "") {
  return asString(value) || fallback;
}

function questBasePath() {
  return paths.expansionQuests;
}

function questsPath() {
  return joinStoragePath(questBasePath(), "Quests");
}

function objectivesBasePath() {
  return joinStoragePath(questBasePath(), "Objectives");
}

function objectivePath(type) {
  const meta = OBJECTIVE_TYPES[type] || OBJECTIVE_TYPES[DEFAULT_OBJECTIVE_TYPE];
  return joinStoragePath(objectivesBasePath(), meta.folder);
}

function npcsPath() {
  return joinStoragePath(questBasePath(), "NPCs");
}

async function readJsonFile(pathValue) {
  const [raw, fileStat] = await Promise.all([
    readFile(pathValue, "utf8"),
    stat(pathValue).catch(() => null),
  ]);
  const data = parseJson(raw);
  if (!data || typeof data !== "object") {
    throw new Error(`Invalid JSON: ${pathValue}`);
  }
  return { data, updatedAt: getStatIso(fileStat) };
}

async function listJsonFiles(dirPath) {
  try {
    return (await readdir(dirPath)).filter((file) => file.toLowerCase().endsWith(".json"));
  } catch (err) {
    if (isNotFound(err)) return [];
    throw err;
  }
}

async function readJsonSummaries(dirPath, summarize) {
  const files = await listJsonFiles(dirPath);
  const summaries = [];
  const errors = [];

  for (const fileName of files) {
    const filePath = joinStoragePath(dirPath, fileName);
    try {
      const { data, updatedAt } = await readJsonFile(filePath);
      summaries.push(summarize(data, fileName, filePath, updatedAt));
    } catch (err) {
      errors.push({ fileName, path: filePath, error: err?.message || String(err) });
    }
  }

  return { summaries, errors };
}

function objectiveTypeMeta(type) {
  return OBJECTIVE_TYPES[type] || {
    key: "unknown",
    label: `Type ${type}`,
    folder: "Unknown",
    prefix: "Objective",
  };
}

function questSummary(data, fileName, filePath, updatedAt) {
  return {
    fileName,
    path: filePath,
    updatedAt,
    id: positiveInt(data.ID, 0),
    title: cleanSummaryText(data.Title, fileName.replace(/\.json$/i, "")),
    type: positiveInt(data.Type, 0),
    active: data.Active !== 0,
    objectiveText: cleanSummaryText(data.ObjectiveText),
    objectiveCount: Array.isArray(data.Objectives) ? data.Objectives.length : 0,
    objectives: Array.isArray(data.Objectives) ? data.Objectives.map((objective) => ({
      id: positiveInt(objective?.ID, 0),
      objectiveType: positiveInt(objective?.ObjectiveType, 0),
      objectiveTypeLabel: objectiveTypeMeta(positiveInt(objective?.ObjectiveType, 0)).label,
    })) : [],
    questGiverIds: Array.isArray(data.QuestGiverIDs) ? data.QuestGiverIDs : [],
    questTurnInIds: Array.isArray(data.QuestTurnInIDs) ? data.QuestTurnInIDs : [],
    preQuestIds: Array.isArray(data.PreQuestIDs) ? data.PreQuestIDs : [],
    followUpQuest: Number.isFinite(Number(data.FollowUpQuest)) ? Number(data.FollowUpQuest) : -1,
    repeatable: Boolean(data.Repeatable),
    isDailyQuest: Boolean(data.IsDailyQuest),
    isWeeklyQuest: Boolean(data.IsWeeklyQuest),
    rewardCount: Array.isArray(data.Rewards) ? data.Rewards.length : 0,
  };
}

function firstNumberPoint(value) {
  if (!Array.isArray(value) || value.length < 3) return null;
  const point = [Number(value[0]), Number(value[1]), Number(value[2])];
  return point.every((item) => Number.isFinite(item)) ? point : null;
}

function collectObjectivePositions(data) {
  const positions = [];
  const direct = firstNumberPoint(data.Position);
  if (direct) positions.push(direct);

  if (Array.isArray(data.Positions)) {
    for (const point of data.Positions) {
      const normalized = firstNumberPoint(point);
      if (normalized) positions.push(normalized);
    }
  }

  if (data.AISpawn && Array.isArray(data.AISpawn.Waypoints)) {
    for (const point of data.AISpawn.Waypoints) {
      const normalized = firstNumberPoint(point);
      if (normalized) positions.push(normalized);
    }
  }

  if (Array.isArray(data.AISpawns)) {
    for (const spawn of data.AISpawns) {
      if (!Array.isArray(spawn?.Waypoints)) continue;
      for (const point of spawn.Waypoints) {
        const normalized = firstNumberPoint(point);
        if (normalized) positions.push(normalized);
      }
    }
  }

  return positions;
}

function objectiveSummary(data, fileName, filePath, updatedAt, folder) {
  const type = positiveInt(data.ObjectiveType, 0);
  const positions = collectObjectivePositions(data);
  return {
    fileName,
    folder,
    path: filePath,
    updatedAt,
    id: positiveInt(data.ID, 0),
    objectiveType: type,
    objectiveTypeLabel: objectiveTypeMeta(type).label,
    text: cleanSummaryText(data.ObjectiveText, fileName.replace(/\.json$/i, "")),
    active: data.Active !== 0,
    position: positions[0] || null,
    positions,
    maxDistance: Number.isFinite(Number(data.MaxDistance)) ? Number(data.MaxDistance) : null,
    amount: Number.isFinite(Number(data.Amount)) ? Number(data.Amount) : null,
    collectionCount: Array.isArray(data.Collections) ? data.Collections.length : 0,
    classNames: Array.isArray(data.ClassNames) ? data.ClassNames : [],
  };
}

function npcSummary(data, fileName, filePath, updatedAt) {
  return {
    fileName,
    path: filePath,
    updatedAt,
    id: positiveInt(data.ID, 0),
    name: cleanSummaryText(data.NPCName, fileName.replace(/\.json$/i, "")),
    className: cleanSummaryText(data.ClassName),
    active: data.Active !== 0,
    position: Array.isArray(data.Position) ? data.Position : null,
    npcType: Number.isFinite(Number(data.NPCType)) ? Number(data.NPCType) : null,
    faction: cleanSummaryText(data.NPCFaction),
  };
}

async function listObjectives() {
  const objectives = [];
  const errors = [];

  for (const meta of Object.values(OBJECTIVE_TYPES)) {
    const dirPath = joinStoragePath(objectivesBasePath(), meta.folder);
    const result = await readJsonSummaries(dirPath, (data, fileName, filePath, updatedAt) => (
      objectiveSummary(data, fileName, filePath, updatedAt, meta.folder)
    ));
    objectives.push(...result.summaries);
    errors.push(...result.errors);
  }

  objectives.sort((a, b) => (a.objectiveType - b.objectiveType) || (a.id - b.id) || a.fileName.localeCompare(b.fileName));
  return { objectives, errors };
}

function maxId(items) {
  return items.reduce((highest, item) => Math.max(highest, positiveInt(item.id, 0)), 0);
}

function createReward(className = "Apple", amount = 1) {
  return {
    ClassName: className,
    Amount: amount,
    Attachments: [],
    DamagePercent: 0,
    HealthPercent: 0,
    QuestID: -1,
    Chance: 1.0,
  };
}

function createDefaultQuest(id) {
  return {
    ConfigVersion: QUEST_CONFIG_VERSION,
    ID: id,
    Type: 1,
    Title: `New Quest ${id}`,
    Descriptions: [
      "Tell the player what is happening.",
      "Remind the player what to do.",
      "Thank the player and give the reward.",
    ],
    ObjectiveText: "Complete the objective.",
    FollowUpQuest: -1,
    Repeatable: 0,
    IsDailyQuest: 0,
    IsWeeklyQuest: 0,
    CancelQuestOnPlayerDeath: 0,
    Autocomplete: 0,
    IsGroupQuest: 0,
    ObjectSetFileName: "",
    QuestItems: [],
    Rewards: [createReward()],
    NeedToSelectReward: 0,
    RandomReward: 0,
    RandomRewardAmount: -1,
    RewardsForGroupOwnerOnly: 1,
    RewardBehavior: 0,
    QuestGiverIDs: [],
    QuestTurnInIDs: [],
    IsAchievement: 0,
    Objectives: [],
    QuestColor: 0,
    ReputationReward: 0,
    ReputationRequirement: -1,
    PreQuestIDs: [],
    RequiredFaction: "",
    FactionReward: "",
    PlayerNeedQuestItems: 1,
    DeleteQuestItems: 1,
    SequentialObjectives: 1,
    FactionReputationRequirements: {},
    FactionReputationRewards: {},
    SuppressQuestLogOnCompetion: 0,
    Active: 1,
  };
}

function createDefaultObjective(id, type = DEFAULT_OBJECTIVE_TYPE) {
  const normalizedType = OBJECTIVE_TYPES[type] ? type : DEFAULT_OBJECTIVE_TYPE;
  const base = {
    ConfigVersion: OBJECTIVE_CONFIG_VERSION,
    ID: id,
    ObjectiveType: normalizedType,
    ObjectiveText: "Complete this objective",
    TimeLimit: -1,
    Active: 1,
  };

  if (normalizedType === 2) {
    return {
      ...base,
      Position: [0, 0, 0],
      MaxDistance: 150.0,
      MinDistance: -1.0,
      Amount: 1,
      ClassNames: [],
      CountSelfKill: 0,
      AllowedWeapons: [],
      ExcludedClassNames: [],
      CountAIPlayers: 0,
      AllowedTargetFactions: [],
      AllowedDamageZones: [],
    };
  }

  if (normalizedType === 4 || normalizedType === 5) {
    return {
      ...base,
      Collections: [
        {
          Amount: 1,
          ClassName: "Apple",
          QuantityPercent: -1,
          MinQuantityPercent: -1,
        },
      ],
      ShowDistance: 1,
      AddItemsToNearbyMarketZone: 0,
      ...(normalizedType === 5 ? { MaxDistance: 20.0, MarkerName: "Delivery point" } : { NeedAnyCollection: 0 }),
    };
  }

  if (normalizedType === 10) {
    return {
      ...base,
      ActionNames: [],
      AllowedClassNames: [],
      ExcludedClassNames: [],
      ExecutionAmount: 1,
    };
  }

  if (normalizedType === 6) {
    return {
      ...base,
      ObjectiveText: "Find the treasure",
      ShowDistance: 1,
      ContainerName: "ExpansionQuestSeaChest",
      DigInStash: 1,
      MarkerName: "???",
      MarkerVisibility: 4,
      Positions: [[0, 0, 0]],
      LootItemsAmount: 0,
      MaxDistance: 10.0,
      Loot: [],
    };
  }

  if (normalizedType === 7 || normalizedType === 8) {
    const spawn = {
      Name: normalizedType === 8 ? "Quest Camp AI" : "Quest Patrol AI",
      Persist: 0,
      Faction: "West",
      Formation: normalizedType === 8 ? "RANDOM" : "Vee",
      FormationScale: 1.5,
      FormationLooseness: 0.0,
      Loadout: "BanditLoadout",
      Units: ["eAI_SurvivorM_Mirek"],
      NumberOfAI: normalizedType === 8 ? 3 : 5,
      NumberOfAIMax: 0,
      Behaviour: normalizedType === 8 ? "HALT_OR_ALTERNATE" : "HALT_OR_LOOP",
      LootingBehaviour: "",
      Speed: normalizedType === 8 ? "WALK" : "JOG",
      UnderThreatSpeed: "SPRINT",
      DefaultStance: "STANDING",
      DefaultLookAngle: 0.0,
      CanBeLooted: 1,
      LootDropOnDeath: "",
      UnlimitedReload: 1,
      SniperProneDistanceThreshold: 300.0,
      AccuracyMin: 0.5,
      AccuracyMax: 0.8,
      ThreatDistanceLimit: 500.0,
      NoiseInvestigationDistanceLimit: -1.0,
      MaxFlankingDistance: -1.0,
      EnableFlankingOutsideCombat: -1,
      DamageMultiplier: 1.0,
      DamageReceivedMultiplier: 1.0,
      HeadshotResistance: 0.0,
      ShoryukenChance: 0.0,
      ShoryukenDamageMultiplier: 0.0,
      CanSpawnInContaminatedArea: 0,
      CanBeTriggeredByAI: 0,
      MinDistRadius: 50.0,
      MaxDistRadius: 500.0,
      DespawnRadius: 600.0,
      MinSpreadRadius: 0.0,
      MaxSpreadRadius: 0.0,
      Chance: 1.0,
      DespawnTime: 1.0,
      RespawnTime: 1.0,
      LoadBalancingCategory: "",
      ObjectClassName: "",
      WaypointInterpolation: "",
      UseRandomWaypointAsStartPoint: 1,
      Waypoints: [[0, 0, 0]],
    };

    return normalizedType === 8
      ? {
          ...base,
          ObjectiveText: "Clear the AI camp",
          InfectedDeletionRadius: 500.0,
          MaxDistance: -1.0,
          MinDistance: -1.0,
          AllowedWeapons: [],
          AllowedDamageZones: [],
          AISpawns: [spawn],
        }
      : {
          ...base,
          ObjectiveText: "Clear the AI patrol",
          MaxDistance: -1.0,
          MinDistance: -1.0,
          AllowedWeapons: [],
          AllowedDamageZones: [],
          AISpawn: spawn,
        };
  }

  if (normalizedType === 9) {
    return {
      ...base,
      ObjectiveText: "Escort the survivor to the marked location.",
      TimeLimit: 180,
      Position: [0, 0, 0],
      MaxDistance: 20.0,
      MarkerName: "Escort Survivor",
      ShowDistance: 1,
      CanLootAI: 0,
      NPCLoadoutFile: "SurvivorLoadout",
      NPCClassName: "eAI_SurvivorM_Manua",
      NPCName: "Survivor",
    };
  }

  if (normalizedType === 11) {
    return {
      ...base,
      ObjectiveText: "Craft the required item",
      ItemNames: ["ImprovisedFishingRod"],
      ExecutionAmount: 1,
    };
  }

  return {
    ...base,
    Position: [0, 0, 0],
    MaxDistance: 20.0,
    MarkerName: "Travel point",
    ShowDistance: 1,
    TriggerOnEnter: 1,
    TriggerOnExit: 0,
  };
}

function createDefaultNpc(id) {
  return {
    ConfigVersion: NPC_CONFIG_VERSION,
    ID: id,
    ClassName: "ExpansionQuestNPCAIDenis",
    Position: [0, 0, 0],
    Orientation: [0, 0, 0],
    NPCName: `Quest NPC ${id}`,
    DefaultNPCText: "Hello survivor.",
    Waypoints: [[0, 0, 0]],
    NPCEmoteID: 46,
    NPCEmoteIsStatic: 0,
    NPCLoadoutFile: "",
    NPCInteractionEmoteID: 1,
    NPCQuestCancelEmoteID: 60,
    NPCQuestStartEmoteID: 58,
    NPCQuestCompleteEmoteID: 39,
    NPCFaction: "InvincibleObservers",
    NPCType: 2,
    Active: 1,
  };
}

function normalizeQuest(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("Quest payload must be a JSON object");
  }

  const quest = { ...value };
  quest.ConfigVersion = positiveInt(quest.ConfigVersion, QUEST_CONFIG_VERSION);
  quest.ID = positiveInt(quest.ID, 1);
  quest.Type = positiveInt(quest.Type, 1);
  quest.Title = cleanSummaryText(quest.Title, `Quest ${quest.ID}`);
  quest.Descriptions = Array.isArray(quest.Descriptions) ? quest.Descriptions.map((item) => String(item ?? "")) : ["", "", ""];
  quest.ObjectiveText = cleanSummaryText(quest.ObjectiveText, "Complete the objective.");
  quest.QuestGiverIDs = Array.isArray(quest.QuestGiverIDs) ? quest.QuestGiverIDs.map((id) => positiveInt(id, 0)).filter(Boolean) : [];
  quest.QuestTurnInIDs = Array.isArray(quest.QuestTurnInIDs) ? quest.QuestTurnInIDs.map((id) => positiveInt(id, 0)).filter(Boolean) : [];
  quest.PreQuestIDs = Array.isArray(quest.PreQuestIDs) ? quest.PreQuestIDs.map((id) => positiveInt(id, 0)).filter(Boolean) : [];
  quest.Objectives = Array.isArray(quest.Objectives) ? quest.Objectives.map((objective) => ({
    ConfigVersion: positiveInt(objective?.ConfigVersion, OBJECTIVE_CONFIG_VERSION),
    ID: positiveInt(objective?.ID, 1),
    ObjectiveType: positiveInt(objective?.ObjectiveType, DEFAULT_OBJECTIVE_TYPE),
  })) : [];
  quest.QuestItems = Array.isArray(quest.QuestItems) ? quest.QuestItems : [];
  quest.Rewards = Array.isArray(quest.Rewards) ? quest.Rewards : [];
  quest.Active = quest.Active === 0 ? 0 : 1;
  return quest;
}

function normalizeObjective(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("Objective payload must be a JSON object");
  }

  const objective = { ...value };
  objective.ConfigVersion = positiveInt(objective.ConfigVersion, OBJECTIVE_CONFIG_VERSION);
  objective.ID = positiveInt(objective.ID, 1);
  objective.ObjectiveType = positiveInt(objective.ObjectiveType, DEFAULT_OBJECTIVE_TYPE);
  objective.ObjectiveText = cleanSummaryText(objective.ObjectiveText, "Complete this objective");
  objective.Active = objective.Active === 0 ? 0 : 1;

  if (objective.Position) {
    objective.Position = normalizeNumberArray(objective.Position, [0, 0, 0]);
  }

  if (Array.isArray(objective.Collections)) {
    objective.Collections = objective.Collections.map((item) => ({
      Amount: positiveInt(item?.Amount, 1),
      ClassName: cleanSummaryText(item?.ClassName, "Apple"),
      QuantityPercent: Number.isFinite(Number(item?.QuantityPercent)) ? Number(item.QuantityPercent) : -1,
      MinQuantityPercent: Number.isFinite(Number(item?.MinQuantityPercent)) ? Number(item.MinQuantityPercent) : -1,
    }));
  }

  return objective;
}

function normalizeNpc(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("NPC payload must be a JSON object");
  }

  const npc = { ...value };
  npc.ConfigVersion = positiveInt(npc.ConfigVersion, NPC_CONFIG_VERSION);
  npc.ID = positiveInt(npc.ID, 1);
  npc.ClassName = cleanSummaryText(npc.ClassName, "ExpansionQuestNPCAIDenis");
  npc.Position = normalizeNumberArray(npc.Position, [0, 0, 0]);
  npc.Orientation = normalizeNumberArray(npc.Orientation, [0, 0, 0]);
  npc.NPCName = cleanSummaryText(npc.NPCName, `Quest NPC ${npc.ID}`);
  npc.DefaultNPCText = cleanSummaryText(npc.DefaultNPCText, "Hello survivor.");
  npc.Waypoints = Array.isArray(npc.Waypoints) ? npc.Waypoints.map((point) => normalizeNumberArray(point, [0, 0, 0])) : [npc.Position];
  npc.Active = npc.Active === 0 ? 0 : 1;
  return npc;
}

async function ensureQuestFolders() {
  await Promise.all([
    mkdir(questsPath(), { recursive: true }),
    mkdir(npcsPath(), { recursive: true }),
    ...Object.values(OBJECTIVE_TYPES).map((meta) => mkdir(joinStoragePath(objectivesBasePath(), meta.folder), { recursive: true })),
  ]);
}

async function writeJson(pathValue, data) {
  await writeFile(pathValue, `${JSON.stringify(data, null, 4)}\n`, "utf8");
}

router.get("/templates", (_req, res) => {
  res.json({
    quest: createDefaultQuest(1),
    npc: createDefaultNpc(1),
    objectiveTypes: Object.entries(OBJECTIVE_TYPES).map(([type, meta]) => ({
      type: Number(type),
      ...meta,
      template: createDefaultObjective(1, Number(type)),
    })),
  });
});

router.get("/", async (_req, res) => {
  try {
    const [questResult, objectiveResult, npcResult] = await Promise.all([
      readJsonSummaries(questsPath(), questSummary),
      listObjectives(),
      readJsonSummaries(npcsPath(), npcSummary),
    ]);

    const quests = questResult.summaries.sort((a, b) => a.id - b.id);
    const objectives = objectiveResult.objectives;
    const npcs = npcResult.summaries.sort((a, b) => a.id - b.id);

    res.json({
      path: questBasePath(),
      folders: {
        quests: questsPath(),
        objectives: objectivesBasePath(),
        npcs: npcsPath(),
      },
      counts: {
        quests: quests.length,
        objectives: objectives.length,
        npcs: npcs.length,
      },
      nextIds: {
        quest: maxId(quests) + 1,
        objective: maxId(objectives) + 1,
        npc: maxId(npcs) + 1,
      },
      quests,
      objectives,
      npcs,
      errors: [
        ...questResult.errors,
        ...objectiveResult.errors,
        ...npcResult.errors,
      ],
    });
  } catch (err) {
    res.status(500).json({
      error: "Failed to read Expansion quest configuration",
      path: questBasePath(),
      details: err?.message || String(err),
    });
  }
});

router.get("/quest/:fileName", async (req, res) => {
  try {
    const fileName = sanitizeFileName(req.params.fileName);
    const filePath = joinStoragePath(questsPath(), fileName);
    const { data, updatedAt } = await readJsonFile(filePath);
    res.json({ fileName, path: filePath, updatedAt, quest: data });
  } catch (err) {
    res.status(isNotFound(err) ? 404 : 400).json({ error: "Quest not found", details: err?.message || String(err) });
  }
});

router.put("/quest/:fileName", async (req, res) => {
  try {
    await ensureQuestFolders();
    const fileName = sanitizeFileName(req.params.fileName);
    const quest = normalizeQuest(req.body?.quest || req.body);
    const filePath = joinStoragePath(questsPath(), fileName);
    await writeJson(filePath, quest);
    res.json({ success: true, fileName, path: filePath, quest, message: `Saved ${fileName}` });
  } catch (err) {
    res.status(400).json({ error: "Failed to save quest", details: err?.message || String(err) });
  }
});

router.delete("/quest/:fileName", async (req, res) => {
  try {
    const fileName = sanitizeFileName(req.params.fileName);
    const filePath = joinStoragePath(questsPath(), fileName);
    await unlink(filePath);
    res.json({ success: true, fileName, path: filePath, message: `Deleted ${fileName}` });
  } catch (err) {
    res.status(isNotFound(err) ? 404 : 400).json({ error: "Failed to delete quest", details: err?.message || String(err) });
  }
});

router.post("/quest", async (req, res) => {
  try {
    await ensureQuestFolders();
    const quest = normalizeQuest(req.body?.quest || createDefaultQuest(req.body?.id));
    const fileName = sanitizeFileName(req.body?.fileName || `Quest_${quest.ID}.json`);
    const filePath = joinStoragePath(questsPath(), fileName);
    try {
      await readFile(filePath, "utf8");
      return res.status(409).json({ error: "Quest file already exists", fileName });
    } catch (err) {
      if (!isNotFound(err)) throw err;
    }
    await writeJson(filePath, quest);
    res.json({ success: true, fileName, path: filePath, quest, message: `Created ${fileName}` });
  } catch (err) {
    res.status(400).json({ error: "Failed to create quest", details: err?.message || String(err) });
  }
});

router.get("/objective/:type/:fileName", async (req, res) => {
  try {
    const type = positiveInt(req.params.type, DEFAULT_OBJECTIVE_TYPE);
    const fileName = sanitizeFileName(req.params.fileName);
    const filePath = joinStoragePath(objectivePath(type), fileName);
    const { data, updatedAt } = await readJsonFile(filePath);
    res.json({ fileName, path: filePath, updatedAt, objective: data });
  } catch (err) {
    res.status(isNotFound(err) ? 404 : 400).json({ error: "Objective not found", details: err?.message || String(err) });
  }
});

router.put("/objective/:type/:fileName", async (req, res) => {
  try {
    await ensureQuestFolders();
    const type = positiveInt(req.params.type, DEFAULT_OBJECTIVE_TYPE);
    const fileName = sanitizeFileName(req.params.fileName);
    const objective = normalizeObjective({ ...(req.body?.objective || req.body), ObjectiveType: type });
    const filePath = joinStoragePath(objectivePath(type), fileName);
    await writeJson(filePath, objective);
    res.json({ success: true, fileName, path: filePath, objective, message: `Saved ${fileName}` });
  } catch (err) {
    res.status(400).json({ error: "Failed to save objective", details: err?.message || String(err) });
  }
});

router.delete("/objective/:type/:fileName", async (req, res) => {
  try {
    const type = positiveInt(req.params.type, DEFAULT_OBJECTIVE_TYPE);
    const fileName = sanitizeFileName(req.params.fileName);
    const filePath = joinStoragePath(objectivePath(type), fileName);
    await unlink(filePath);
    res.json({ success: true, fileName, path: filePath, message: `Deleted ${fileName}` });
  } catch (err) {
    res.status(isNotFound(err) ? 404 : 400).json({ error: "Failed to delete objective", details: err?.message || String(err) });
  }
});

router.post("/objective", async (req, res) => {
  try {
    await ensureQuestFolders();
    const requestedType = positiveInt(req.body?.type || req.body?.objective?.ObjectiveType, DEFAULT_OBJECTIVE_TYPE);
    const objective = normalizeObjective(req.body?.objective || createDefaultObjective(req.body?.id, requestedType));
    const meta = OBJECTIVE_TYPES[objective.ObjectiveType] || OBJECTIVE_TYPES[DEFAULT_OBJECTIVE_TYPE];
    const fileName = sanitizeFileName(req.body?.fileName || `${meta.prefix}_${objective.ID}.json`);
    const filePath = joinStoragePath(objectivePath(objective.ObjectiveType), fileName);
    try {
      await readFile(filePath, "utf8");
      return res.status(409).json({ error: "Objective file already exists", fileName });
    } catch (err) {
      if (!isNotFound(err)) throw err;
    }
    await writeJson(filePath, objective);
    res.json({ success: true, fileName, path: filePath, objective, message: `Created ${fileName}` });
  } catch (err) {
    res.status(400).json({ error: "Failed to create objective", details: err?.message || String(err) });
  }
});

router.get("/npc/:fileName", async (req, res) => {
  try {
    const fileName = sanitizeFileName(req.params.fileName);
    const filePath = joinStoragePath(npcsPath(), fileName);
    const { data, updatedAt } = await readJsonFile(filePath);
    res.json({ fileName, path: filePath, updatedAt, npc: data });
  } catch (err) {
    res.status(isNotFound(err) ? 404 : 400).json({ error: "NPC not found", details: err?.message || String(err) });
  }
});

router.put("/npc/:fileName", async (req, res) => {
  try {
    await ensureQuestFolders();
    const fileName = sanitizeFileName(req.params.fileName);
    const npc = normalizeNpc(req.body?.npc || req.body);
    const filePath = joinStoragePath(npcsPath(), fileName);
    await writeJson(filePath, npc);
    res.json({ success: true, fileName, path: filePath, npc, message: `Saved ${fileName}` });
  } catch (err) {
    res.status(400).json({ error: "Failed to save NPC", details: err?.message || String(err) });
  }
});

router.delete("/npc/:fileName", async (req, res) => {
  try {
    const fileName = sanitizeFileName(req.params.fileName);
    const filePath = joinStoragePath(npcsPath(), fileName);
    await unlink(filePath);
    res.json({ success: true, fileName, path: filePath, message: `Deleted ${fileName}` });
  } catch (err) {
    res.status(isNotFound(err) ? 404 : 400).json({ error: "Failed to delete NPC", details: err?.message || String(err) });
  }
});

router.post("/npc", async (req, res) => {
  try {
    await ensureQuestFolders();
    const npc = normalizeNpc(req.body?.npc || createDefaultNpc(req.body?.id));
    const fileName = sanitizeFileName(req.body?.fileName || `QuestNPC_${npc.ID}.json`);
    const filePath = joinStoragePath(npcsPath(), fileName);
    try {
      await readFile(filePath, "utf8");
      return res.status(409).json({ error: "NPC file already exists", fileName });
    } catch (err) {
      if (!isNotFound(err)) throw err;
    }
    await writeJson(filePath, npc);
    res.json({ success: true, fileName, path: filePath, npc, message: `Created ${fileName}` });
  } catch (err) {
    res.status(400).json({ error: "Failed to create NPC", details: err?.message || String(err) });
  }
});

export default router;
