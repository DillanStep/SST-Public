import { features, getRuntimeEnv, paths } from "../config.js";
import { readFile, readdir } from "../storage/fs.js";
import { aiSnapshotMetadata, getAiPositionsSnapshot } from "./aiPositions.js";
import { joinStoragePath, normalizeStoragePath } from "./storagePath.js";

const MAX_JSON_SCAN_FILES = 200;
const MAX_EVENT_LAYERS = 700;

function isObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function asNumber(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function unique(values) {
  return [...new Set(values.filter(Boolean))];
}

function dirnameStoragePath(pathValue) {
  const normalized = normalizeStoragePath(pathValue);
  if (!normalized) return "";
  const index = normalized.lastIndexOf("/");
  if (index <= 0) return normalized.startsWith("/") ? "/" : "";
  return normalized.slice(0, index);
}

function stripKnownExpansionChild(pathValue) {
  const normalized = normalizeStoragePath(pathValue);
  return normalized.replace(/\/(ATM|Traders|Market|AI|Loadouts|Settings)$/i, "");
}

function isNotFound(error) {
  const code = String(error?.code || "").toUpperCase();
  const message = String(error?.message || "").toLowerCase();
  return code === "ENOENT" || message.includes("no such file") || message.includes("not found");
}

function safeJsonParse(raw, filePath) {
  try {
    return { data: JSON.parse(raw), error: null };
  } catch (error) {
    return { data: null, error: `Invalid JSON in ${filePath}: ${error.message}` };
  }
}

async function readJsonFile(filePath) {
  try {
    const raw = await readFile(filePath, "utf8");
    const parsed = safeJsonParse(raw, filePath);
    return {
      name: filePath.split("/").pop() || filePath,
      path: filePath,
      found: true,
      keys: isObject(parsed.data) ? Object.keys(parsed.data).slice(0, 20) : [],
      data: parsed.data,
      error: parsed.error,
    };
  } catch (error) {
    return {
      name: filePath.split("/").pop() || filePath,
      path: filePath,
      found: false,
      keys: [],
      data: null,
      error: isNotFound(error) ? null : error.message,
    };
  }
}

async function listJsonFiles(folderPath) {
  try {
    const entries = await readdir(folderPath);
    return entries
      .filter((entry) => String(entry).toLowerCase().endsWith(".json"))
      .slice(0, MAX_JSON_SCAN_FILES)
      .map((entry) => joinStoragePath(folderPath, entry));
  } catch {
    return [];
  }
}

async function readJsonFiles(folderPath, predicate = () => true) {
  const files = await listJsonFiles(folderPath);
  const matchingFiles = files.filter((filePath) => predicate(filePath.split("/").pop() || filePath));
  const parsed = [];

  for (const filePath of matchingFiles) {
    parsed.push(await readJsonFile(filePath));
  }

  return parsed.filter((file) => file.found && !file.error);
}

function getExpansionBaseCandidates() {
  const explicitAiPath = normalizeStoragePath(getRuntimeEnv("EXPANSION_AI_PATH"));
  const profileExpansionPath = paths.profiles ? joinStoragePath(paths.profiles, "ExpansionMod") : "";
  const missionPath = normalizeStoragePath(paths.missionFolder);
  const missionRoot = (() => {
    const marker = "/mpmissions/";
    const index = missionPath.toLowerCase().lastIndexOf(marker);
    return index >= 0 ? missionPath.slice(0, index) : "";
  })();

  return unique([
    profileExpansionPath,
    explicitAiPath ? stripKnownExpansionChild(explicitAiPath) : "",
    paths.expansionAtm ? stripKnownExpansionChild(dirnameStoragePath(paths.expansionAtm)) : "",
    paths.expansionTraders ? stripKnownExpansionChild(dirnameStoragePath(paths.expansionTraders)) : "",
    paths.expansionMarket ? stripKnownExpansionChild(dirnameStoragePath(paths.expansionMarket)) : "",
    missionRoot ? joinStoragePath(missionRoot, "Server1", "ExpansionMod") : "",
    missionRoot ? joinStoragePath(missionRoot, "profiles", "ExpansionMod") : "",
  ]);
}

function getAISettingsCandidates(expansionBases) {
  return unique(expansionBases.flatMap((base) => [
    joinStoragePath(base, "Settings", "AISettings.json"),
    joinStoragePath(base, "Settings", "ExpansionAISettings.json"),
    joinStoragePath(base, "AISettings.json"),
  ]));
}

function getPatrolSettingsCandidates(expansionBases) {
  return unique([
    joinStoragePath(paths.missionFolder, "expansion", "settings", "AIPatrolSettings.json"),
    joinStoragePath(paths.missionFolder, "expansion", "ai", "AIPatrolSettings.json"),
    ...expansionBases.flatMap((base) => [
      joinStoragePath(base, "Settings", "AIPatrolSettings.json"),
      joinStoragePath(base, "AI", "AIPatrolSettings.json"),
      joinStoragePath(base, "AI", "Patrols", "AIPatrolSettings.json"),
    ]),
  ]);
}

function getMissionExpansionFolders() {
  return unique([
    paths.missionFolder ? joinStoragePath(paths.missionFolder, "expansion") : "",
  ]);
}

function getAirdropSettingsCandidates(expansionBases) {
  return unique([
    joinStoragePath(paths.missionFolder, "expansion", "settings", "AirdropSettings.json"),
    ...expansionBases.flatMap((base) => [
      joinStoragePath(base, "Settings", "AirdropSettings.json"),
      joinStoragePath(base, "AirdropSettings.json"),
    ]),
  ]);
}

function getLoadoutFolders(expansionBases) {
  return unique(expansionBases.flatMap((base) => [
    joinStoragePath(base, "Loadouts"),
    joinStoragePath(base, "AI", "Loadouts"),
  ]));
}

function pickFirstNumber(source, keys, fallback = 0) {
  for (const key of keys) {
    const value = source?.[key];
    if (value === undefined || value === null || value === "") continue;
    const number = Number(value);
    if (Number.isFinite(number)) return number;
  }

  return fallback;
}

function pickFirstString(source, keys, fallback = "") {
  for (const key of keys) {
    const value = source?.[key];
    if (value !== undefined && value !== null && String(value).trim()) {
      return String(value).trim();
    }
  }

  return fallback;
}

function boolish(value) {
  if (value === true || value === 1) return true;
  if (value === false || value === 0 || value === undefined || value === null) return false;
  const text = String(value).trim().toLowerCase();
  return text === "1" || text === "true" || text === "yes" || text === "enabled";
}

function countArray(value) {
  return Array.isArray(value) ? value.length : 0;
}

function extractPosition(value) {
  if (Array.isArray(value) && value.length >= 3) {
    const x = Number(value[0]);
    const y = Number(value[1]);
    const z = Number(value[2]);
    if (Number.isFinite(x) && Number.isFinite(z)) {
      return { x, y: Number.isFinite(y) ? y : null, z };
    }
  }

  if (isObject(value)) {
    const x = Number(value.x ?? value.X ?? value.posX ?? value.PosX);
    const y = Number(value.y ?? value.Y ?? value.posY ?? value.PosY);
    const z = Number(value.z ?? value.Z ?? value.posZ ?? value.PosZ);
    if (Number.isFinite(x) && Number.isFinite(z)) {
      return { x, y: Number.isFinite(y) ? y : null, z };
    }
  }

  return null;
}

function extractFirstPosition(source, keys) {
  for (const key of keys) {
    const position = extractPosition(source?.[key]);
    if (position) return position;
  }

  return null;
}

function normalizeWaypointList(value) {
  if (!Array.isArray(value)) return [];
  return value
    .map((waypoint) => extractPosition(waypoint))
    .filter(Boolean);
}

function patrolWaypointPositions(patrol) {
  const waypointSources = [
    patrol?.Waypoints,
    patrol?.m_Waypoints,
    patrol?.Points,
    patrol?.Positions,
    patrol?.Path,
    patrol?.Route,
  ];

  for (const source of waypointSources) {
    const waypoints = normalizeWaypointList(source);
    if (waypoints.length > 0) return waypoints;
  }

  return [];
}

function centerOfPositions(positions) {
  if (!positions.length) return null;
  const total = positions.reduce((sum, position) => ({
    x: sum.x + position.x,
    y: sum.y + (Number.isFinite(position.y) ? position.y : 0),
    z: sum.z + position.z,
  }), { x: 0, y: 0, z: 0 });

  return {
    x: total.x / positions.length,
    y: total.y / positions.length,
    z: total.z / positions.length,
  };
}

function isEnabled(value, fallback = true) {
  if (value === undefined || value === null || value === "") return fallback;
  return !(value === false || value === 0 || String(value).trim() === "0");
}

function cleanName(value, fallback = "Unnamed") {
  return String(value || fallback)
    .replace(/^Random[_\s-]*/i, "")
    .replace(/^Settlement[_\s-]*/i, "")
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim() || fallback;
}

function patrolUnitCount(patrol) {
  const direct = pickFirstNumber(patrol, [
    "NumberOfAI",
    "NPCCount",
    "UnitCount",
    "Units",
    "Count",
    "m_NumberOfAI",
    "m_Count",
  ], NaN);

  if (Number.isFinite(direct) && direct > 0) return direct;

  const arrayCounts = [
    countArray(patrol?.Units),
    countArray(patrol?.Members),
    countArray(patrol?.NPCs),
    countArray(patrol?.m_Units),
  ].filter((value) => value > 0);

  return arrayCounts[0] || 1;
}

function patrolWaypoints(patrol) {
  return patrolWaypointPositions(patrol).length || Math.max(
    countArray(patrol?.Waypoints),
    countArray(patrol?.m_Waypoints),
    countArray(patrol?.Points),
    countArray(patrol?.Positions)
  );
}

function getPatrolArrays(data) {
  if (Array.isArray(data)) return [{ key: "Patrols", value: data }];
  if (!isObject(data)) return [];

  const keys = [
    "Patrols",
    "Patrol",
    "ObjectPatrols",
    "EventCrashPatrol",
    "DynamicPatrols",
    "StaticPatrols",
    "AIPatrols",
    "Groups",
  ];

  return keys
    .filter((key) => Array.isArray(data[key]))
    .map((key) => ({ key, value: data[key] }));
}

function normalizePatrol(patrol, sourcePath, index, collectionKey) {
  const name = pickFirstString(
    patrol,
    ["Name", "m_Name", "DisplayName", "FactionName", "ClassName", "m_ClassName"],
    `${collectionKey || "Patrol"} ${index + 1}`
  );
  const faction = pickFirstString(patrol, ["Faction", "m_Faction", "FactionName", "fac"], "Unknown");
  const loadout = pickFirstString(patrol, ["LoadoutFile", "Loadout", "m_LoadoutFile", "loa"], "");
  const type = pickFirstString(patrol, ["Type", "m_Type", "PatrolType", "Formation"], collectionKey || "Patrol");
  const unitCount = patrolUnitCount(patrol);
  const waypointPositions = patrolWaypointPositions(patrol);
  const waypoints = waypointPositions.length || patrolWaypoints(patrol);
  const dynamic = boolish(patrol?.Dynamic) || /dynamic/i.test(type) || /dynamic/i.test(collectionKey || "");
  const position = extractFirstPosition(patrol, ["Position", "Pos", "Location", "SpawnPosition", "Center"])
    || centerOfPositions(waypointPositions);

  return {
    name,
    faction,
    type,
    loadout,
    unitCount,
    maxUnitCount: pickFirstNumber(patrol, ["NumberOfAIMax", "MaxAI", "MaxUnits", "m_NumberOfAIMax"], null),
    behaviour: pickFirstString(patrol, ["Behaviour", "Behavior", "m_Behaviour"], ""),
    speed: pickFirstString(patrol, ["Speed", "m_Speed"], ""),
    waypoints,
    waypointPositions: waypointPositions.slice(0, 30),
    dynamic,
    position,
    respawnTime: pickFirstNumber(patrol, ["RespawnTime", "m_RespawnTime"], null),
    minDistance: pickFirstNumber(patrol, ["MinDistRadius", "m_MinDistRadius"], null),
    maxDistance: pickFirstNumber(patrol, ["MaxDistRadius", "m_MaxDistRadius"], null),
    sourcePath,
  };
}

function extractPatrols(settingsFiles) {
  const patrols = [];

  for (const file of settingsFiles) {
    for (const { key, value } of getPatrolArrays(file.data)) {
      value.forEach((patrol, index) => {
        if (isObject(patrol)) {
          patrols.push(normalizePatrol(patrol, file.path, index, key));
        }
      });
    }
  }

  return patrols;
}

function flattenSignals(value, prefix = "", output = []) {
  if (output.length > 500) return output;

  if (Array.isArray(value)) {
    if (value.length <= 25) {
      value.forEach((item, index) => flattenSignals(item, `${prefix}[${index}]`, output));
    }
    return output;
  }

  if (isObject(value)) {
    for (const [key, child] of Object.entries(value)) {
      const nextPrefix = prefix ? `${prefix}.${key}` : key;
      flattenSignals(child, nextPrefix, output);
    }
    return output;
  }

  if (typeof value === "number" || typeof value === "boolean") {
    output.push({ key: prefix, value });
  }

  return output;
}

function signalValue(signals, keyMatcher) {
  const matches = signals.filter((signal) => keyMatcher(signal.key) && typeof signal.value === "number");
  if (!matches.length) return null;
  return matches.reduce((max, signal) => Math.max(max, asNumber(signal.value)), Number.NEGATIVE_INFINITY);
}

function buildLiveSummary(snapshot) {
  const ai = Array.isArray(snapshot.ai) ? snapshot.ai : [];
  const byFaction = {};
  const byGroup = {};
  let healthTotal = 0;
  let healthSamples = 0;
  let unconscious = 0;

  for (const unit of ai) {
    const faction = String(unit?.faction || "Unknown");
    const group = String(unit?.groupName || unit?.groupId || "Ungrouped");
    byFaction[faction] = (byFaction[faction] || 0) + 1;
    byGroup[group] = (byGroup[group] || 0) + 1;

    const health = Number(unit?.health);
    if (Number.isFinite(health)) {
      healthTotal += health;
      healthSamples += 1;
    }

    if (unit?.isUnconscious === true) unconscious += 1;
  }

  return {
    ...aiSnapshotMetadata(snapshot),
    byFaction,
    byGroup,
    unconscious,
    averageHealth: healthSamples ? Math.round(healthTotal / healthSamples) : null,
  };
}

function summarizeLoadouts(files) {
  const names = files
    .filter((file) => file.found && !file.error)
    .map((file) => file.name)
    .slice(0, 12);

  return {
    count: files.filter((file) => file.found && !file.error).length,
    names,
  };
}

function asEventZone({
  id,
  type,
  name,
  enabled = true,
  position = null,
  radius = null,
  sourcePath,
  detail = "",
  meta = {},
  waypoints = [],
}) {
  return {
    id,
    type,
    name: cleanName(name, type),
    enabled: Boolean(enabled),
    x: position ? Number(position.x) : null,
    y: position && Number.isFinite(position.y) ? Number(position.y) : null,
    z: position ? Number(position.z) : null,
    radius: Number.isFinite(Number(radius)) ? Number(radius) : null,
    sourcePath,
    detail,
    meta,
    waypoints,
  };
}

function normalizeAirdropMission(file, defaults) {
  const mission = file.data || {};
  const location = mission.DropLocation || mission.Location || {};
  const position = extractPosition(location) || extractFirstPosition(mission, ["Position", "Pos", "Location"]);
  const radius = pickFirstNumber(location, ["Radius", "radius"], pickFirstNumber(mission, ["Radius"], 100));
  const itemCount = pickFirstNumber(mission, ["ItemCount"], pickFirstNumber(defaults, ["ItemCount"], null));
  const infectedCount = pickFirstNumber(mission, ["InfectedCount"], pickFirstNumber(defaults, ["InfectedCount"], null));
  const name = location.Name || mission.MissionName || file.name.replace(/\.json$/i, "");

  return asEventZone({
    id: `airdrop:${file.name}`,
    type: "airdrop",
    name,
    enabled: isEnabled(mission.Enabled, true),
    position,
    radius,
    sourcePath: file.path,
    detail: `${pickFirstNumber(mission, ["Weight"], 0)} weight`,
    meta: {
      weight: pickFirstNumber(mission, ["Weight"], 0),
      missionMaxTime: pickFirstNumber(mission, ["MissionMaxTime"], null),
      container: pickFirstString(mission, ["Container"], "Random"),
      itemCount,
      infectedCount,
    },
  });
}

function normalizeContaminatedMission(file) {
  const mission = file.data || {};
  const data = isObject(mission.Data) ? mission.Data : {};
  const position = extractPosition(data.Pos) || extractPosition(data.Position) || extractFirstPosition(mission, ["Position", "Pos", "Location"]);

  return asEventZone({
    id: `contaminated:${file.name}`,
    type: "contaminated",
    name: mission.MissionName || file.name.replace(/\.json$/i, ""),
    enabled: isEnabled(mission.Enabled, false),
    position,
    radius: pickFirstNumber(data, ["Radius"], pickFirstNumber(mission, ["Radius"], null)),
    sourcePath: file.path,
    detail: isEnabled(mission.Enabled, false) ? "Enabled event" : "Disabled event",
    meta: {
      weight: pickFirstNumber(mission, ["Weight"], 0),
      verticalLayers: countArray(data.VerticalLayers),
      particleName: pickFirstString(data, ["ParticleName"], ""),
    },
  });
}

function normalizeRoamingLocation(location, sourcePath, index) {
  const position = extractPosition(location.Position) || extractPosition(location.Pos) || extractPosition(location.Location);
  const type = pickFirstString(location, ["Type", "LocationType"], "Roaming");

  return asEventZone({
    id: `roaming:${index}:${location.Name || type}`,
    type: "roaming",
    name: location.Name || `${type} ${index + 1}`,
    enabled: isEnabled(location.Enabled, true),
    position,
    radius: pickFirstNumber(location, ["Radius"], null),
    sourcePath,
    detail: type,
    meta: {
      locationType: type,
    },
  });
}

function normalizeQuestAiObjective(file) {
  const objective = file.data || {};
  const spawn = isObject(objective.AISpawn) ? objective.AISpawn : {};
  const position = extractFirstPosition(objective, ["Position", "MarkerPosition", "Location", "Pos"])
    || extractFirstPosition(spawn, ["Position", "MarkerPosition", "Location", "Pos"])
    || centerOfPositions(patrolWaypointPositions(spawn));
  const unitCount = pickFirstNumber(spawn, ["NumberOfAI", "Count"], countArray(spawn.Units));

  return asEventZone({
    id: `quest-ai:${file.name}`,
    type: "quest",
    name: objective.ObjectiveText || spawn.Name || file.name.replace(/\.json$/i, ""),
    enabled: isEnabled(objective.Active, true),
    position,
    radius: pickFirstNumber(spawn, ["AccuracyRadius", "Radius"], null),
    sourcePath: file.path,
    detail: unitCount ? `${unitCount} AI objective` : "AI quest objective",
    meta: {
      objectiveId: pickFirstNumber(objective, ["ID"], null),
      unitCount,
      faction: pickFirstString(spawn, ["Faction"], ""),
      loadout: pickFirstString(spawn, ["Loadout"], ""),
    },
    waypoints: patrolWaypointPositions(spawn).slice(0, 30),
  });
}

function buildPatrolEventZone(patrol, index) {
  const position = patrol.position || centerOfPositions(patrol.waypointPositions || []);

  return asEventZone({
    id: `patrol:${index}:${patrol.name}`,
    type: "patrol",
    name: patrol.name || `${patrol.faction} patrol ${index + 1}`,
    enabled: true,
    position,
    radius: pickFirstNumber(patrol, ["maxDistance", "minDistance"], null),
    sourcePath: patrol.sourcePath,
    detail: `${patrol.unitCount}${patrol.maxUnitCount ? `-${patrol.maxUnitCount}` : ""} AI, ${patrol.faction}`,
    meta: {
      faction: patrol.faction,
      loadout: patrol.loadout,
      unitCount: patrol.unitCount,
      maxUnitCount: patrol.maxUnitCount,
      behaviour: patrol.behaviour,
      speed: patrol.speed,
      waypoints: patrol.waypoints,
    },
    waypoints: (patrol.waypointPositions || []).slice(0, 30),
  });
}

function eventCounts(zones) {
  return {
    total: zones.length,
    enabled: zones.filter((zone) => zone.enabled).length,
    mapped: zones.filter((zone) => Number.isFinite(zone.x) && Number.isFinite(zone.z)).length,
  };
}

async function findKothCandidates(expansionBases, missionExpansionFolders) {
  const candidateFolders = unique([
    ...missionExpansionFolders.flatMap((folder) => [
      joinStoragePath(folder, "settings"),
      joinStoragePath(folder, "missions"),
    ]),
    ...expansionBases.flatMap((base) => [
      joinStoragePath(base, "Settings"),
      joinStoragePath(base, "Missions"),
      joinStoragePath(base, "Events"),
    ]),
  ]);
  const matches = [];

  for (const folder of candidateFolders) {
    const files = await listJsonFiles(folder);
    matches.push(...files.filter((filePath) => /koth|king.?of.?the.?hill|king.?hill/i.test(filePath)));
  }

  return unique(matches).slice(0, 25);
}

async function loadExpansionEvents(expansionBases, patrols) {
  const missionExpansionFolders = getMissionExpansionFolders();
  const airdropSettingsFiles = await Promise.all(getAirdropSettingsCandidates(expansionBases).map(readJsonFile));
  const airdropSettingsFile = airdropSettingsFiles.find((file) => file.found && !file.error) || null;
  const airdrops = [];
  const contaminatedAreas = [];
  const roamingLocations = [];
  const questAiObjectives = [];

  for (const folder of missionExpansionFolders) {
    const missionsFolder = joinStoragePath(folder, "missions");
    const settingsFolder = joinStoragePath(folder, "settings");

    const airdropFiles = await readJsonFiles(missionsFolder, (name) => /^Airdrop_.*\.json$/i.test(name));
    airdrops.push(...airdropFiles.map((file) => normalizeAirdropMission(file, airdropSettingsFile?.data || {})));

    const contaminatedFiles = await readJsonFiles(missionsFolder, (name) => /^ContaminatedArea_.*\.json$/i.test(name));
    contaminatedAreas.push(...contaminatedFiles.map(normalizeContaminatedMission));

    const aiLocationFiles = await readJsonFiles(settingsFolder, (name) => /^AILocationSettings\.json$/i.test(name));
    for (const file of aiLocationFiles) {
      const locations = Array.isArray(file.data?.RoamingLocations) ? file.data.RoamingLocations : [];
      locations.forEach((location, index) => {
        if (isObject(location)) roamingLocations.push(normalizeRoamingLocation(location, file.path, index));
      });
    }
  }

  for (const base of expansionBases) {
    const objectiveFiles = await readJsonFiles(
      joinStoragePath(base, "Quests", "Objectives", "AIPatrol"),
      (name) => /\.json$/i.test(name)
    );
    questAiObjectives.push(...objectiveFiles.map(normalizeQuestAiObjective));
  }

  const patrolZones = patrols
    .map(buildPatrolEventZone)
    .filter((zone) => Number.isFinite(zone.x) && Number.isFinite(zone.z));
  const kothFiles = await findKothCandidates(expansionBases, missionExpansionFolders);
  const mapLayers = [
    ...airdrops,
    ...contaminatedAreas,
    ...roamingLocations,
    ...patrolZones,
    ...questAiObjectives.filter((zone) => Number.isFinite(zone.x) && Number.isFinite(zone.z)),
  ].slice(0, MAX_EVENT_LAYERS);

  return {
    summary: {
      airdrops: eventCounts(airdrops),
      contaminatedAreas: eventCounts(contaminatedAreas),
      roamingLocations: eventCounts(roamingLocations),
      patrolRoutes: eventCounts(patrolZones),
      questAiObjectives: eventCounts(questAiObjectives),
      koth: {
        detected: kothFiles.length > 0,
        files: kothFiles,
      },
      mapLayers: eventCounts(mapLayers),
    },
    airdrops: airdrops.slice(0, 80),
    contaminatedAreas: contaminatedAreas.slice(0, 80),
    roamingLocations: roamingLocations.slice(0, 250),
    patrolRoutes: patrolZones.slice(0, 80),
    questAiObjectives: questAiObjectives.slice(0, 80),
    koth: {
      detected: kothFiles.length > 0,
      files: kothFiles,
    },
    mapLayers,
    configFiles: {
      airdropSettingsFile: airdropSettingsFile ? trimFileInfo(airdropSettingsFile) : null,
    },
  };
}

function buildMetrics({ patrols, loadouts, live }) {
  const configuredUnits = patrols.reduce((total, patrol) => total + patrol.unitCount, 0);
  const maxGroupSize = patrols.reduce((max, patrol) => Math.max(max, patrol.unitCount), 0);
  const avgGroupSize = patrols.length ? configuredUnits / patrols.length : 0;
  const factions = new Set(patrols.map((patrol) => patrol.faction).filter((name) => name && name !== "Unknown"));

  return {
    liveAi: live.aiCount || 0,
    patrolCount: patrols.length,
    configuredUnits,
    maxGroupSize,
    avgGroupSize: Number(avgGroupSize.toFixed(1)),
    factionCount: factions.size,
    loadoutCount: loadouts.count,
    staticPatrols: patrols.filter((patrol) => !patrol.dynamic).length,
    dynamicPatrols: patrols.filter((patrol) => patrol.dynamic).length,
  };
}

function buildDifficulty({ metrics, signals }) {
  const accuracyMax = signalValue(signals, (key) => /accuracy(max)?$/i.test(key) || /aim/i.test(key));
  const threatDistance = signalValue(signals, (key) => /threat.*distance|vision|sight|noise.*distance/i.test(key));
  const damageMultiplier = signalValue(signals, (key) => /damage.*multiplier/i.test(key));
  const respawnSignals = signals.filter((signal) => /respawn/i.test(signal.key) && typeof signal.value === "number");
  const fastestRespawn = respawnSignals.length
    ? respawnSignals.reduce((min, signal) => Math.min(min, asNumber(signal.value, min)), Number.POSITIVE_INFINITY)
    : null;

  const factors = [
    {
      label: "Live AI population",
      value: `${metrics.liveAi} active`,
      impact: metrics.liveAi >= 80 ? "high" : metrics.liveAi >= 35 ? "medium" : "low",
      score: clamp(metrics.liveAi * 0.7, 0, 18),
      detail: "How many AI are currently active from SST telemetry.",
    },
    {
      label: "Configured patrol load",
      value: `${metrics.configuredUnits} configured units`,
      impact: metrics.configuredUnits >= 120 ? "high" : metrics.configuredUnits >= 50 ? "medium" : "low",
      score: clamp(metrics.configuredUnits * 0.28, 0, 22),
      detail: "Estimated units from Expansion patrol settings.",
    },
    {
      label: "Group pressure",
      value: `${metrics.maxGroupSize || 0} max per patrol`,
      impact: metrics.maxGroupSize >= 10 ? "high" : metrics.maxGroupSize >= 6 ? "medium" : "low",
      score: clamp(metrics.maxGroupSize * 2.2, 0, 18),
      detail: "Large patrols feel harder and can add server load.",
    },
    {
      label: "Accuracy settings",
      value: accuracyMax === null ? "Not detected" : `${accuracyMax}`,
      impact: accuracyMax !== null && accuracyMax >= 0.75 ? "high" : accuracyMax !== null && accuracyMax >= 0.45 ? "medium" : "low",
      score: accuracyMax === null ? 0 : clamp(accuracyMax <= 1 ? accuracyMax * 18 : accuracyMax * 0.18, 0, 18),
      detail: "High accuracy values usually make AI more lethal.",
    },
    {
      label: "Engagement range",
      value: threatDistance === null ? "Not detected" : `${Math.round(threatDistance)}m`,
      impact: threatDistance !== null && threatDistance >= 900 ? "high" : threatDistance !== null && threatDistance >= 450 ? "medium" : "low",
      score: threatDistance === null ? 0 : clamp(threatDistance / 70, 0, 14),
      detail: "Long threat or noise ranges make AI engage from farther away.",
    },
    {
      label: "Damage pressure",
      value: damageMultiplier === null ? "Not detected" : `${damageMultiplier}x`,
      impact: damageMultiplier !== null && damageMultiplier >= 1.4 ? "high" : damageMultiplier !== null && damageMultiplier > 1 ? "medium" : "low",
      score: damageMultiplier === null ? 0 : clamp((damageMultiplier - 1) * 16, 0, 10),
      detail: "Damage multipliers above 1 make mistakes cost more.",
    },
    {
      label: "Respawn pressure",
      value: fastestRespawn === null || !Number.isFinite(fastestRespawn) ? "Not detected" : `${Math.round(fastestRespawn)}s fastest`,
      impact: fastestRespawn !== null && fastestRespawn >= 0 && fastestRespawn <= 300 ? "medium" : "low",
      score: fastestRespawn !== null && fastestRespawn >= 0 ? clamp((900 - fastestRespawn) / 90, 0, 10) : 0,
      detail: "Fast respawns keep areas contested after players clear them.",
    },
  ];

  const hasEvidence = metrics.liveAi > 0 || metrics.patrolCount > 0 || signals.length > 0;
  const score = hasEvidence ? Math.round(clamp(factors.reduce((total, factor) => total + factor.score, 0), 0, 100)) : 0;
  const label = !hasEvidence
    ? "Unknown"
    : score >= 75
      ? "Extreme"
      : score >= 55
        ? "Hard"
        : score >= 30
          ? "Moderate"
          : "Low";

  return {
    score,
    label,
    factors: factors.map(({ score: factorScore, ...factor }) => ({
      ...factor,
      weight: Math.round(clamp(factorScore / 22, 0, 1) * 100),
    })),
  };
}

function addFinding(findings, severity, title, detail, action = "", path = "") {
  findings.push({ severity, title, detail, action, path });
}

function buildFindings({ live, config, metrics, difficulty, events }) {
  const findings = [];

  if (!features.expansionEnabled) {
    addFinding(
      findings,
      "critical",
      "Expansion features are disabled",
      "AI analysis needs Expansion paths to read AI settings.",
      "Enable EXPANSION_ENABLED in Settings if this server uses DayZ Expansion AI."
    );
  }

  if (live.isStale) {
    addFinding(
      findings,
      "warning",
      "AI telemetry is stale",
      "SST has not received a fresh AI positions export from the mod.",
      "Confirm the server is running and the SST mod can write ai_positions.json.",
      paths.aiPositions
    );
  } else if (live.aiCount === 0) {
    addFinding(
      findings,
      "info",
      "No live AI currently reported",
      "The AI export is fresh, but there are no active units in the snapshot.",
      "This can be normal when no patrols are spawned or no players are in spawn range."
    );
  }

  if (!config.aiSettingsFile?.found) {
    addFinding(
      findings,
      "warning",
      "AISettings.json was not found",
      "SST could not locate the global Expansion AI difficulty file.",
      "Check the ExpansionMod/Settings path or add the Expansion AI path in Settings."
    );
  }

  if (!config.patrolSettingsFile?.found && metrics.patrolCount === 0) {
    addFinding(
      findings,
      "warning",
      "No AI patrol settings found",
      "SST could not find mission expansion/settings/AIPatrolSettings.json or patrol data.",
      "Point MISSION_PATH at the active mission folder and verify Expansion AI patrols are configured."
    );
  }

  if (metrics.maxGroupSize >= 10) {
    addFinding(
      findings,
      "critical",
      "Very large AI patrol group",
      `One patrol is configured for ${metrics.maxGroupSize} AI.`,
      "Consider splitting large patrols into smaller groups for clearer fights and lower load."
    );
  } else if (metrics.maxGroupSize >= 6) {
    addFinding(
      findings,
      "warning",
      "Large AI patrol group",
      `The largest patrol has ${metrics.maxGroupSize} AI.`,
      "Review whether this fits the intended difficulty for that area."
    );
  }

  if (metrics.liveAi >= 100) {
    addFinding(
      findings,
      "critical",
      "High live AI population",
      `${metrics.liveAi} AI are active in the latest telemetry snapshot.`,
      "Check spawn distances, despawn time, and player-triggered patrol density."
    );
  } else if (metrics.liveAi >= 50) {
    addFinding(
      findings,
      "warning",
      "Elevated live AI population",
      `${metrics.liveAi} AI are active in the latest telemetry snapshot.`,
      "Watch server FPS and review patrol density around busy areas."
    );
  }

  if (metrics.patrolCount > 0 && metrics.factionCount <= 1) {
    addFinding(
      findings,
      "info",
      "Limited faction variety",
      "Most or all patrols appear to use the same faction.",
      "Faction variety helps make AI zones easier to reason about."
    );
  }

  if (metrics.loadoutCount === 0) {
    addFinding(
      findings,
      "info",
      "No loadout files found",
      "SST did not find Expansion loadout JSON files.",
      "If your AI use custom loadouts, confirm the ExpansionMod/Loadouts path."
    );
  }

  if (events) {
    if (events.summary?.roamingLocations?.enabled >= 200) {
      addFinding(
        findings,
        "warning",
        "Dense AI roaming coverage",
        `${events.summary.roamingLocations.enabled} roaming AI locations are enabled.`,
        "Use the coverage map to check whether large towns and mission hotspots are over-stacked."
      );
    }

    if (events.summary?.airdrops?.enabled > 10) {
      addFinding(
        findings,
        "info",
        "Many airdrop zones enabled",
        `${events.summary.airdrops.enabled} airdrop missions can currently run.`,
        "Review weights and overlap with AI patrols so airdrops do not pull players into overloaded areas."
      );
    }

    if (events.summary?.contaminatedAreas?.total > 0 && events.summary.contaminatedAreas.enabled === 0) {
      addFinding(
        findings,
        "info",
        "Contaminated mission templates are disabled",
        `${events.summary.contaminatedAreas.total} contaminated area templates exist, but none are enabled.`,
        "Enable only the zones you want to rotate into the mission pool."
      );
    }

    if (!events.koth?.detected) {
      addFinding(
        findings,
        "info",
        "KOTH config not detected",
        "No King of the Hill/KOTH JSON config was found in the Expansion profile or mission expansion folders.",
        "If KOTH is supplied by another mod, add that config path before SST can visualise it."
      );
    }
  }

  if (findings.length === 0) {
    addFinding(
      findings,
      "ok",
      "AI setup looks readable",
      `SST found patrol/config data and currently rates this setup as ${difficulty.label}.`,
      "Keep checking after live events or major AI config changes."
    );
  }

  return findings;
}

function trimFileInfo(file) {
  return {
    name: file.name,
    path: file.path,
    found: file.found,
    keys: file.keys,
    error: file.error,
  };
}

export async function getAIAnalysis() {
  const expansionBases = getExpansionBaseCandidates();
  const aiSettingsFiles = await Promise.all(getAISettingsCandidates(expansionBases).map(readJsonFile));
  const patrolSettingsFiles = await Promise.all(getPatrolSettingsCandidates(expansionBases).map(readJsonFile));
  const aiSettingsFile = aiSettingsFiles.find((file) => file.found && !file.error) || aiSettingsFiles[0] || null;
  const patrolSettingsFile = patrolSettingsFiles.find((file) => file.found && !file.error) || patrolSettingsFiles[0] || null;

  const loadoutFiles = [];
  for (const folder of getLoadoutFolders(expansionBases)) {
    const files = await listJsonFiles(folder);
    for (const filePath of files) {
      loadoutFiles.push(await readJsonFile(filePath));
    }
  }

  const patrolSourceFiles = patrolSettingsFiles.filter((file) => file.found && !file.error);
  const patrols = extractPatrols(patrolSourceFiles).slice(0, 500);
  const events = await loadExpansionEvents(expansionBases, patrols);
  const signals = [
    ...flattenSignals(aiSettingsFile?.data),
    ...flattenSignals(patrolSettingsFile?.data),
  ];
  const snapshot = await getAiPositionsSnapshot();
  const live = buildLiveSummary(snapshot);
  const loadouts = summarizeLoadouts(loadoutFiles);
  const metrics = buildMetrics({ patrols, loadouts, live });
  const difficulty = buildDifficulty({ metrics, signals });
  const config = {
    expansionEnabled: features.expansionEnabled,
    expansionBases,
    aiSettingsFile: aiSettingsFile ? trimFileInfo(aiSettingsFile) : null,
    patrolSettingsFile: patrolSettingsFile ? trimFileInfo(patrolSettingsFile) : null,
    settingsFiles: [...aiSettingsFiles, ...patrolSettingsFiles].map(trimFileInfo),
    loadouts,
  };
  const findings = buildFindings({ live, config, metrics, difficulty, events });

  return {
    generatedAt: new Date().toISOString(),
    live,
    config,
    difficulty,
    findings,
    metrics,
    patrols: patrols.slice(0, 80),
    events,
  };
}
