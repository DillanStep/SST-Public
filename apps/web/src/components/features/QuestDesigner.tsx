import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { CircleMarker, MapContainer, Polyline, Popup, useMap, useMapEvents } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import {
  AlertTriangle,
  Bot,
  Check,
  Crosshair,
  FileJson,
  MapPin,
  Plus,
  RefreshCw,
  Save,
  ScrollText,
  Search,
  Trash2,
  UserRound,
} from 'lucide-react';
import { Badge, Button, Card } from '../ui';
import {
  createExpansionQuest,
  createExpansionQuestNpc,
  createExpansionQuestObjective,
  deleteExpansionQuest,
  deleteExpansionQuestNpc,
  deleteExpansionQuestObjective,
  getExpansionQuest,
  getExpansionQuestNpc,
  getExpansionQuestObjective,
  getExpansionQuestTemplates,
  getExpansionQuests,
  saveExpansionQuest,
  saveExpansionQuestNpc,
  saveExpansionQuestObjective,
} from '../../services/api';
import { MapImageLayer } from '../../maps/MapImageLayer';
import { gameToMap, mapCenter, mapRenderKey, mapToGame, paddedMapBounds, type ActiveMapConfig } from '../../maps/mapConfig';
import { useMapConfig } from '../../maps/useMapConfig';
import type {
  ExpansionQuestConfig,
  ExpansionQuestListResponse,
  ExpansionQuestNpcConfig,
  ExpansionQuestNpcSummary,
  ExpansionQuestObjectiveConfig,
  ExpansionQuestObjectiveSummary,
  ExpansionQuestObjectiveTypeTemplate,
  ExpansionQuestTemplatesResponse,
} from '../../types';

interface QuestDesignerProps {
  isConnected: boolean;
}

type QuestMode = 'edit' | 'new';
type PlotTarget = 'objective' | 'npc';
type PlotMode = 'set' | 'add';

interface GamePoint {
  x: number;
  y: number;
  z: number;
}

interface PlotPoint {
  id: string;
  label: string;
  position: number[];
  kind: 'objective' | 'npc' | 'draft-objective' | 'draft-npc';
}

const clone = <T,>(value: T): T => JSON.parse(JSON.stringify(value));

function apiError(err: unknown, fallback: string): string {
  const data = (err as { response?: { data?: { error?: string; details?: string } }; message?: string })?.response?.data;
  if (data?.error) return data.details ? `${data.error}: ${data.details}` : data.error;
  return (err as { message?: string })?.message || fallback;
}

function numberValue(value: unknown, fallback = 0): number {
  const next = Number(value);
  return Number.isFinite(next) ? next : fallback;
}

function intValue(value: unknown, fallback = 0): number {
  return Math.trunc(numberValue(value, fallback));
}

function parseIds(value: string): number[] {
  return value
    .split(/[,\s]+/)
    .map((part) => Number.parseInt(part.trim(), 10))
    .filter((number) => Number.isFinite(number) && number > 0);
}

function idsToText(value?: number[]): string {
  return Array.isArray(value) ? value.join(', ') : '';
}

function boolToFlag(value: boolean): number {
  return value ? 1 : 0;
}

function isEnabled(value: unknown): boolean {
  return value === 1 || value === true;
}

function formatPosition(position?: number[] | null): string {
  if (!Array.isArray(position) || position.length < 3) return 'No position';
  return `${Math.round(numberValue(position[0]))}, ${Math.round(numberValue(position[1]))}, ${Math.round(numberValue(position[2]))}`;
}

function normalizePoint(value: unknown): number[] | null {
  if (!Array.isArray(value) || value.length < 3) return null;
  const point = [numberValue(value[0]), numberValue(value[1]), numberValue(value[2])];
  return point.every(Number.isFinite) ? point : null;
}

function pointFromGame(value: GamePoint, yFallback = 0): number[] {
  return [
    Math.round(value.x * 100) / 100,
    Number.isFinite(value.y) ? Math.round(value.y * 100) / 100 : yFallback,
    Math.round(value.z * 100) / 100,
  ];
}

function getObjectivePoints(objective?: ExpansionQuestObjectiveConfig | null): PlotPoint[] {
  if (!objective) return [];
  const points: PlotPoint[] = [];
  const direct = normalizePoint(objective.Position);
  if (direct) {
    points.push({
      id: 'objective-position',
      label: 'Objective position',
      position: direct,
      kind: 'draft-objective',
    });
  }

  const treasurePositions = Array.isArray(objective.Positions) ? objective.Positions : [];
  treasurePositions.forEach((point, index) => {
    const normalized = normalizePoint(point);
    if (normalized) {
      points.push({
        id: `objective-position-${index}`,
        label: `Treasure point ${index + 1}`,
        position: normalized,
        kind: 'draft-objective',
      });
    }
  });

  const aiSpawn = objective.AISpawn as { Waypoints?: unknown[] } | undefined;
  if (aiSpawn?.Waypoints) {
    aiSpawn.Waypoints.forEach((point, index) => {
      const normalized = normalizePoint(point);
      if (normalized) {
        points.push({
          id: `objective-ai-waypoint-${index}`,
          label: `AI waypoint ${index + 1}`,
          position: normalized,
          kind: 'draft-objective',
        });
      }
    });
  }

  const aiSpawns = Array.isArray(objective.AISpawns) ? objective.AISpawns as Array<{ Waypoints?: unknown[]; Name?: string }> : [];
  aiSpawns.forEach((spawn, spawnIndex) => {
    (spawn.Waypoints || []).forEach((point, pointIndex) => {
      const normalized = normalizePoint(point);
      if (normalized) {
        points.push({
          id: `objective-ai-camp-${spawnIndex}-${pointIndex}`,
          label: `${spawn.Name || `AI group ${spawnIndex + 1}`} waypoint ${pointIndex + 1}`,
          position: normalized,
          kind: 'draft-objective',
        });
      }
    });
  });

  return points;
}

function objectiveSupportsMap(objective?: ExpansionQuestObjectiveConfig | null): boolean {
  if (!objective) return false;
  return [2, 3, 6, 7, 8, 9].includes(Number(objective.ObjectiveType)) || Boolean(objective.Position);
}

function objectiveSupportsMultiplePoints(objective?: ExpansionQuestObjectiveConfig | null): boolean {
  if (!objective) return false;
  return [6, 7, 8].includes(Number(objective.ObjectiveType));
}

function applyObjectivePoint(objective: ExpansionQuestObjectiveConfig, point: GamePoint, mode: PlotMode): ExpansionQuestObjectiveConfig {
  const next = clone(objective);
  const firstPoint = getObjectivePoints(next)[0]?.position;
  const plotted = pointFromGame(point, numberValue(firstPoint?.[1], 0));

  if (next.ObjectiveType === 6) {
    const positions = (Array.isArray(next.Positions) ? next.Positions : [])
      .map(normalizePoint)
      .filter((item): item is number[] => Boolean(item));
    next.Positions = mode === 'add' ? [...positions, plotted] : [plotted, ...positions.slice(1)];
    return next;
  }

  if (next.ObjectiveType === 7) {
    const spawn = (next.AISpawn && typeof next.AISpawn === 'object' ? next.AISpawn : {}) as { Waypoints?: number[][] };
    const waypoints = (Array.isArray(spawn.Waypoints) ? spawn.Waypoints : [])
      .map(normalizePoint)
      .filter((item): item is number[] => Boolean(item));
    next.AISpawn = {
      ...spawn,
      Waypoints: mode === 'add' ? [...waypoints, plotted] : [plotted, ...waypoints.slice(1)],
    };
    return next;
  }

  if (next.ObjectiveType === 8) {
    const spawns = Array.isArray(next.AISpawns) ? clone(next.AISpawns as unknown[]) as Array<Record<string, unknown>> : [{}];
    const firstSpawn = spawns[0] || {};
    const waypoints = (Array.isArray(firstSpawn.Waypoints) ? firstSpawn.Waypoints : [])
      .map(normalizePoint)
      .filter((item): item is number[] => Boolean(item));
    firstSpawn.Waypoints = mode === 'add' ? [...waypoints, plotted] : [plotted, ...waypoints.slice(1)];
    spawns[0] = firstSpawn;
    next.AISpawns = spawns;
    return next;
  }

  next.Position = plotted;
  return next;
}

function applyNpcPoint(npc: ExpansionQuestNpcConfig, point: GamePoint): ExpansionQuestNpcConfig {
  const plotted = pointFromGame(point, numberValue(npc.Position?.[1], 0));
  const waypoints = Array.isArray(npc.Waypoints) && npc.Waypoints.length > 0 ? [...npc.Waypoints] : [plotted];
  waypoints[0] = plotted;
  return { ...npc, Position: plotted, Waypoints: waypoints };
}

function summaryObjectivePoints(objectives: ExpansionQuestObjectiveSummary[]): PlotPoint[] {
  return objectives.flatMap((objective) => {
    const positions = (objective.positions?.length ? objective.positions : objective.position ? [objective.position] : [])
      .map(normalizePoint)
      .filter((item): item is number[] => Boolean(item));
    return positions.map((position, index) => ({
      id: `${objective.objectiveType}:${objective.fileName}:${index}`,
      label: `${objective.id} · ${objective.objectiveTypeLabel}`,
      position,
      kind: 'objective' as const,
    }));
  });
}

function summaryNpcPoints(npcs: ExpansionQuestNpcSummary[]): PlotPoint[] {
  const points: PlotPoint[] = [];
  for (const npc of npcs) {
    const position = normalizePoint(npc.position);
    if (position) {
      points.push({
        id: npc.fileName,
        label: npc.name,
        position,
        kind: 'npc',
      });
    }
  }
  return points;
}

function objectiveLabel(objective: ExpansionQuestObjectiveSummary): string {
  return `${objective.id} · ${objective.objectiveTypeLabel} · ${objective.text}`;
}

function defaultObjectiveType(templates: ExpansionQuestTemplatesResponse | null): ExpansionQuestObjectiveTypeTemplate | null {
  return templates?.objectiveTypes.find((item) => item.type === 3) || templates?.objectiveTypes[0] || null;
}

function makeQuestFromTemplate(templates: ExpansionQuestTemplatesResponse | null, id: number): ExpansionQuestConfig | null {
  if (!templates?.quest) return null;
  const quest = clone(templates.quest);
  quest.ID = id;
  quest.Title = `New Quest ${id}`;
  quest.ObjectiveText = 'Complete the objective.';
  quest.Descriptions = [
    'Tell the player what is happening.',
    'Remind the player what to do.',
    'Thank the player and give the reward.',
  ];
  return quest;
}

function makeObjectiveFromTemplate(template: ExpansionQuestObjectiveTypeTemplate | null, id: number): ExpansionQuestObjectiveConfig | null {
  if (!template?.template) return null;
  const objective = clone(template.template);
  objective.ID = id;
  objective.ObjectiveText = `New ${template.label} objective`;
  return objective;
}

function makeNpcFromTemplate(templates: ExpansionQuestTemplatesResponse | null, id: number): ExpansionQuestNpcConfig | null {
  if (!templates?.npc) return null;
  const npc = clone(templates.npc);
  npc.ID = id;
  npc.NPCName = `Quest NPC ${id}`;
  return npc;
}

function Field({
  label,
  children,
  hint,
}: {
  label: string;
  children: React.ReactNode;
  hint?: string;
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-surface-500">{label}</span>
      {children}
      {hint && <span className="mt-1 block text-xs text-surface-400">{hint}</span>}
    </label>
  );
}

function TextInput(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      {...props}
      className={`w-full rounded-xl border border-surface-200 bg-surface-50 px-3 py-2 text-sm outline-none transition focus:border-surface-400 focus:bg-white focus:ring-2 focus:ring-surface-200 ${props.className || ''}`}
    />
  );
}

function TextArea(props: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <textarea
      {...props}
      className={`w-full rounded-xl border border-surface-200 bg-surface-50 px-3 py-2 text-sm outline-none transition focus:border-surface-400 focus:bg-white focus:ring-2 focus:ring-surface-200 ${props.className || ''}`}
    />
  );
}

function Toggle({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (value: boolean) => void;
}) {
  return (
    <button
      type="button"
      onClick={() => onChange(!checked)}
      className={`inline-flex items-center gap-2 rounded-xl border px-3 py-2 text-sm font-medium transition ${
        checked
          ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
          : 'border-surface-200 bg-white text-surface-500'
      }`}
    >
      <span className={`h-2.5 w-2.5 rounded-full ${checked ? 'bg-emerald-500' : 'bg-surface-300'}`} />
      {label}
    </button>
  );
}

function QuestMapSetView({ mapConfig }: { mapConfig: ActiveMapConfig }) {
  const map = useMap();
  useEffect(() => {
    map.setView(mapCenter(mapConfig), -2);
  }, [map, mapConfig]);
  return null;
}

function QuestMapClickHandler({
  enabled,
  onPick,
}: {
  enabled: boolean;
  onPick: (lat: number, lng: number) => void;
}) {
  useMapEvents({
    click: (event) => {
      if (enabled) onPick(event.latlng.lat, event.latlng.lng);
    },
  });
  return null;
}

export const QuestDesigner: React.FC<QuestDesignerProps> = ({ isConnected }) => {
  const { mapConfig, loading: mapLoading } = useMapConfig(isConnected);
  const [summary, setSummary] = useState<ExpansionQuestListResponse | null>(null);
  const [templates, setTemplates] = useState<ExpansionQuestTemplatesResponse | null>(null);
  const [selectedFile, setSelectedFile] = useState('');
  const [loadedFile, setLoadedFile] = useState('');
  const [mode, setMode] = useState<QuestMode>('edit');
  const [quest, setQuest] = useState<ExpansionQuestConfig | null>(null);
  const [questJson, setQuestJson] = useState('');
  const [jsonError, setJsonError] = useState('');
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState('');
  const [error, setError] = useState('');
  const [objectiveType, setObjectiveType] = useState(3);
  const [objectiveDraft, setObjectiveDraft] = useState<ExpansionQuestObjectiveConfig | null>(null);
  const [objectiveFile, setObjectiveFile] = useState('');
  const [npcDraft, setNpcDraft] = useState<ExpansionQuestNpcConfig | null>(null);
  const [npcFile, setNpcFile] = useState('');
  const [selectedObjectiveRef, setSelectedObjectiveRef] = useState('');
  const [plotTarget, setPlotTarget] = useState<PlotTarget>('objective');
  const [plotMode, setPlotMode] = useState<PlotMode>('set');
  const [lastPlottedPoint, setLastPlottedPoint] = useState<GamePoint | null>(null);

  const syncQuest = (next: ExpansionQuestConfig | null) => {
    setQuest(next);
    setQuestJson(next ? JSON.stringify(next, null, 4) : '');
    setJsonError('');
  };

  const loadSummary = useCallback(async () => {
    if (!isConnected) return;
    setLoading(true);
    setError('');

    try {
      const [questData, templateData] = await Promise.all([
        getExpansionQuests(),
        getExpansionQuestTemplates(),
      ]);
      setSummary(questData);
      setTemplates(templateData);

      setSelectedFile((current) => current || questData.quests[0]?.fileName || '');
      setObjectiveDraft((current) => {
        if (current) return current;
        const template = defaultObjectiveType(templateData);
        setObjectiveType(template?.type || 3);
        return makeObjectiveFromTemplate(template, questData.nextIds.objective);
      });

      setNpcDraft((current) => current || makeNpcFromTemplate(templateData, questData.nextIds.npc));
    } catch (err) {
      setError(apiError(err, 'Failed to load Expansion quests'));
    } finally {
      setLoading(false);
    }
  }, [isConnected]);

  const loadQuest = useCallback(async (fileName: string) => {
    if (!fileName) return;
    setLoading(true);
    setError('');
    setStatus('');

    try {
      const response = await getExpansionQuest(fileName);
      setSelectedFile(response.fileName);
      setLoadedFile(response.fileName);
      setMode('edit');
      syncQuest(response.quest);
    } catch (err) {
      setError(apiError(err, 'Failed to load quest'));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadSummary();
  }, [loadSummary]);

  useEffect(() => {
    if (selectedFile && mode === 'edit' && loadedFile !== selectedFile) {
      void loadQuest(selectedFile);
    }
  }, [loadQuest, loadedFile, mode, selectedFile]);

  const filteredQuests = useMemo(() => {
    const needle = query.trim().toLowerCase();
    const quests = summary?.quests || [];
    if (!needle) return quests;
    return quests.filter((item) => [
      item.title,
      item.fileName,
      String(item.id),
      item.objectiveText,
    ].some((value) => String(value || '').toLowerCase().includes(needle)));
  }, [query, summary]);

  const selectedObjective = useMemo(() => {
    if (!selectedObjectiveRef || !summary) return null;
    const [type, fileName] = selectedObjectiveRef.split(':');
    return summary.objectives.find((item) => String(item.objectiveType) === type && item.fileName === fileName) || null;
  }, [selectedObjectiveRef, summary]);

  const existingObjectivePoints = useMemo(() => summaryObjectivePoints(summary?.objectives || []), [summary]);
  const existingNpcPoints = useMemo(() => summaryNpcPoints(summary?.npcs || []), [summary]);
  const draftObjectivePoints = useMemo(() => getObjectivePoints(objectiveDraft), [objectiveDraft]);
  const draftNpcPoint = useMemo(() => normalizePoint(npcDraft?.Position), [npcDraft]);
  const canPlotObjective = objectiveSupportsMap(objectiveDraft);
  const canAddObjectivePoint = objectiveSupportsMultiplePoints(objectiveDraft);

  const updateQuest = (updater: (current: ExpansionQuestConfig) => ExpansionQuestConfig) => {
    if (!quest) return;
    const next = updater(clone(quest));
    syncQuest(next);
  };

  const setQuestField = (key: keyof ExpansionQuestConfig, value: unknown) => {
    updateQuest((current) => {
      (current as Record<string, unknown>)[key as string] = value;
      return current;
    });
  };

  const handleNewQuest = () => {
    const next = makeQuestFromTemplate(templates, summary?.nextIds.quest || 1);
    if (!next) return;
    setMode('new');
    setSelectedFile(`Quest_${next.ID}.json`);
    setLoadedFile('');
    syncQuest(next);
    setStatus('');
  };

  const handleJsonApply = () => {
    try {
      const parsed = JSON.parse(questJson) as ExpansionQuestConfig;
      syncQuest(parsed);
      setJsonError('');
    } catch (err) {
      setJsonError(err instanceof Error ? err.message : 'Invalid JSON');
    }
  };

  const handleSaveQuest = async () => {
    if (!quest) return;
    setSaving(true);
    setError('');
    setStatus('');

    try {
      const parsed = JSON.parse(questJson) as ExpansionQuestConfig;
      const fileName = selectedFile || `Quest_${parsed.ID}.json`;
      const response = mode === 'new'
        ? await createExpansionQuest(parsed, fileName)
        : await saveExpansionQuest(fileName, parsed);

      setMode('edit');
      setSelectedFile(response.fileName);
      setLoadedFile(response.fileName);
      syncQuest(response.quest || parsed);
      setStatus(response.message);
      await loadSummary();
    } catch (err) {
      setError(apiError(err, 'Failed to save quest'));
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteQuest = async () => {
    if (!selectedFile || mode === 'new') return;
    const confirmed = window.confirm(`Delete ${selectedFile}? This removes the quest JSON file from ExpansionMod.`);
    if (!confirmed) return;

    setSaving(true);
    setError('');
    setStatus('');
    try {
      const response = await deleteExpansionQuest(selectedFile);
      const refreshed = await getExpansionQuests();
      setSummary(refreshed);
      setStatus(response.message);
      const nextFile = refreshed.quests[0]?.fileName || '';
      setSelectedFile(nextFile);
      setLoadedFile('');
      syncQuest(null);
      if (!nextFile) {
        setMode('edit');
      }
    } catch (err) {
      setError(apiError(err, 'Failed to delete quest'));
    } finally {
      setSaving(false);
    }
  };

  const handleAddObjectiveRef = () => {
    if (!selectedObjective || !quest) return;
    const exists = quest.Objectives.some((item) => item.ID === selectedObjective.id && item.ObjectiveType === selectedObjective.objectiveType);
    if (exists) return;
    updateQuest((current) => {
      current.Objectives.push({
        ConfigVersion: 28,
        ID: selectedObjective.id,
        ObjectiveType: selectedObjective.objectiveType,
      });
      return current;
    });
  };

  const handleNewObjective = () => {
    const template = templates?.objectiveTypes.find((item) => item.type === objectiveType) || defaultObjectiveType(templates);
    setObjectiveFile('');
    setObjectiveDraft(makeObjectiveFromTemplate(template || null, summary?.nextIds.objective || 1));
    setStatus('');
  };

  const handleLoadObjective = async (objective: ExpansionQuestObjectiveSummary) => {
    setSaving(true);
    setError('');
    setStatus('');
    try {
      const response = await getExpansionQuestObjective(objective.objectiveType, objective.fileName);
      setObjectiveType(response.objective.ObjectiveType);
      setObjectiveDraft(response.objective);
      setObjectiveFile(response.fileName);
      setPlotTarget('objective');
    } catch (err) {
      setError(apiError(err, 'Failed to load objective'));
    } finally {
      setSaving(false);
    }
  };

  const handleSaveObjective = async () => {
    if (!objectiveDraft) return;
    setSaving(true);
    setError('');
    setStatus('');
    try {
      const response = objectiveFile
        ? await saveExpansionQuestObjective(objectiveDraft.ObjectiveType, objectiveFile, objectiveDraft)
        : await createExpansionQuestObjective(objectiveDraft);
      setStatus(response.message);
      const refreshed = await getExpansionQuests();
      setSummary(refreshed);
      setObjectiveFile(response.fileName);
      if (response.objective) {
        setObjectiveDraft(response.objective);
        setObjectiveType(response.objective.ObjectiveType);
      }
      if (!objectiveFile) {
        setSelectedObjectiveRef(`${objectiveDraft.ObjectiveType}:${response.fileName}`);
      }
    } catch (err) {
      setError(apiError(err, objectiveFile ? 'Failed to save objective' : 'Failed to create objective'));
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteObjective = async (objective = objectiveDraft, fileName = objectiveFile) => {
    if (!objective || !fileName) return;
    const confirmed = window.confirm(`Delete ${fileName}? Linked quests will keep their objective reference until you remove it.`);
    if (!confirmed) return;

    setSaving(true);
    setError('');
    setStatus('');
    try {
      const response = await deleteExpansionQuestObjective(objective.ObjectiveType, fileName);
      const refreshed = await getExpansionQuests();
      setSummary(refreshed);
      setObjectiveFile('');
      const template = templates?.objectiveTypes.find((item) => item.type === objectiveType) || defaultObjectiveType(templates);
      setObjectiveDraft(makeObjectiveFromTemplate(template || null, refreshed.nextIds.objective));
      setStatus(response.message);
    } catch (err) {
      setError(apiError(err, 'Failed to delete objective'));
    } finally {
      setSaving(false);
    }
  };

  const handleNewNpc = () => {
    setNpcFile('');
    setNpcDraft(makeNpcFromTemplate(templates, summary?.nextIds.npc || 1));
    setStatus('');
  };

  const handleLoadNpc = async (npc: ExpansionQuestNpcSummary) => {
    setSaving(true);
    setError('');
    setStatus('');
    try {
      const response = await getExpansionQuestNpc(npc.fileName);
      setNpcDraft(response.npc);
      setNpcFile(response.fileName);
      setPlotTarget('npc');
    } catch (err) {
      setError(apiError(err, 'Failed to load NPC'));
    } finally {
      setSaving(false);
    }
  };

  const handleSaveNpc = async () => {
    if (!npcDraft) return;
    setSaving(true);
    setError('');
    setStatus('');
    try {
      const response = npcFile
        ? await saveExpansionQuestNpc(npcFile, npcDraft)
        : await createExpansionQuestNpc(npcDraft);
      setStatus(response.message);
      const refreshed = await getExpansionQuests();
      setSummary(refreshed);
      setNpcFile(response.fileName);
      if (response.npc) {
        setNpcDraft(response.npc);
      }
    } catch (err) {
      setError(apiError(err, npcFile ? 'Failed to save NPC' : 'Failed to create NPC'));
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteNpc = async (fileName = npcFile) => {
    if (!fileName) return;
    const confirmed = window.confirm(`Delete ${fileName}?`);
    if (!confirmed) return;

    setSaving(true);
    setError('');
    setStatus('');
    try {
      const response = await deleteExpansionQuestNpc(fileName);
      const refreshed = await getExpansionQuests();
      setSummary(refreshed);
      setNpcFile('');
      setNpcDraft(makeNpcFromTemplate(templates, refreshed.nextIds.npc));
      setStatus(response.message);
    } catch (err) {
      setError(apiError(err, 'Failed to delete NPC'));
    } finally {
      setSaving(false);
    }
  };

  const changeObjectiveType = (nextType: number) => {
    if (objectiveFile) return;
    setObjectiveType(nextType);
    const template = templates?.objectiveTypes.find((item) => item.type === nextType) || defaultObjectiveType(templates);
    setObjectiveDraft(makeObjectiveFromTemplate(template || null, objectiveDraft?.ID || summary?.nextIds.objective || 1));
  };

  const handleMapPick = (lat: number, lng: number) => {
    const mapped = mapToGame(mapConfig, lat, lng);
    const y = plotTarget === 'npc'
      ? numberValue(npcDraft?.Position?.[1], 0)
      : numberValue(getObjectivePoints(objectiveDraft)[0]?.position?.[1], 0);
    const point = { x: mapped.x, y, z: mapped.z };
    setLastPlottedPoint(point);

    if (plotTarget === 'npc') {
      if (!npcDraft) return;
      setNpcDraft((current) => current ? applyNpcPoint(current, point) : current);
      setStatus('NPC position updated from the map.');
      return;
    }

    if (!objectiveDraft || !objectiveSupportsMap(objectiveDraft)) return;
    setObjectiveDraft((current) => current ? applyObjectivePoint(current, point, plotMode) : current);
    setStatus(plotMode === 'add' ? 'Objective point added from the map.' : 'Objective position updated from the map.');
  };

  if (!isConnected) {
    return (
      <Card title="Quest Designer" icon={<ScrollText size={20} />}>
        <div className="py-16 text-center text-surface-500">
          <ScrollText size={44} className="mx-auto mb-4 text-surface-300" />
          Connect to the API to edit DayZ Expansion quests.
        </div>
      </Card>
    );
  }

  return (
    <div className="space-y-5">
      <Card
        title="Quest Designer"
        icon={<ScrollText size={20} />}
        actions={
          <>
            <Button variant="secondary" size="sm" icon={<Plus size={14} />} onClick={handleNewQuest}>
              New Quest
            </Button>
            <Button variant="secondary" size="sm" icon={<RefreshCw size={14} />} loading={loading} onClick={() => void loadSummary()}>
              Refresh
            </Button>
          </>
        }
      >
        <div className="grid gap-3 md:grid-cols-4">
          <div className="rounded-xl border border-surface-200 bg-surface-50 p-4">
            <div className="text-xs font-semibold uppercase tracking-wide text-surface-500">Quests</div>
            <div className="mt-2 text-2xl font-semibold text-surface-900">{summary?.counts.quests || 0}</div>
          </div>
          <div className="rounded-xl border border-surface-200 bg-surface-50 p-4">
            <div className="text-xs font-semibold uppercase tracking-wide text-surface-500">Objectives</div>
            <div className="mt-2 text-2xl font-semibold text-surface-900">{summary?.counts.objectives || 0}</div>
          </div>
          <div className="rounded-xl border border-surface-200 bg-surface-50 p-4">
            <div className="text-xs font-semibold uppercase tracking-wide text-surface-500">Quest NPCs</div>
            <div className="mt-2 text-2xl font-semibold text-surface-900">{summary?.counts.npcs || 0}</div>
          </div>
          <div className="rounded-xl border border-surface-200 bg-surface-50 p-4">
            <div className="text-xs font-semibold uppercase tracking-wide text-surface-500">Config Path</div>
            <div className="mt-2 truncate font-mono text-xs text-surface-700" title={summary?.path}>{summary?.path || 'Not loaded'}</div>
          </div>
        </div>

        {error && (
          <div className="mt-4 flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">
            <AlertTriangle size={16} className="mt-0.5" />
            {error}
          </div>
        )}
        {status && (
          <div className="mt-4 flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-700">
            <Check size={16} />
            {status}
          </div>
        )}
      </Card>

      <Card compact>
        <div className="mb-4 flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <div className="flex items-center gap-2 text-sm font-semibold text-surface-900">
              <Crosshair size={16} />
              Map Plotter
            </div>
            <div className="mt-1 text-sm text-surface-500">
              Click the map to write DayZ coordinates into the selected objective or NPC draft.
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <select
              value={plotTarget}
              onChange={(event) => setPlotTarget(event.target.value as PlotTarget)}
              className="rounded-xl border border-surface-200 bg-white px-3 py-2 text-sm"
            >
              <option value="objective">Objective draft</option>
              <option value="npc">Quest NPC draft</option>
            </select>
            <select
              value={plotMode}
              onChange={(event) => setPlotMode(event.target.value as PlotMode)}
              disabled={plotTarget !== 'objective' || !canAddObjectivePoint}
              className="rounded-xl border border-surface-200 bg-white px-3 py-2 text-sm disabled:bg-surface-100 disabled:text-surface-400"
            >
              <option value="set">Set primary point</option>
              <option value="add">Add point</option>
            </select>
            <Badge variant="info">{mapConfig.label}</Badge>
          </div>
        </div>

        <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_320px]">
          <div className="h-[430px] overflow-hidden rounded-xl border border-surface-200 bg-surface-900">
            <MapContainer
              key={mapRenderKey(mapConfig)}
              crs={L.CRS.Simple}
              center={mapCenter(mapConfig)}
              zoom={-2}
              minZoom={-4}
              maxZoom={2}
              maxBounds={paddedMapBounds(mapConfig)}
              style={{ width: '100%', height: '100%', background: '#0f172a' }}
              attributionControl={false}
              preferCanvas
            >
              <QuestMapSetView mapConfig={mapConfig} />
              <QuestMapClickHandler
                enabled={plotTarget === 'npc' ? Boolean(npcDraft) : canPlotObjective}
                onPick={handleMapPick}
              />
              <MapImageLayer mapConfig={mapConfig} />

              {existingObjectivePoints.map((point) => (
                <CircleMarker
                  key={point.id}
                  center={gameToMap(mapConfig, point.position[0], point.position[2])}
                  radius={4}
                  pathOptions={{ color: '#2563eb', fillColor: '#3b82f6', fillOpacity: 0.65, weight: 1 }}
                >
                  <Popup>
                    <div className="text-sm">
                      <div className="font-semibold">{point.label}</div>
                      <div className="text-xs text-surface-500">{formatPosition(point.position)}</div>
                    </div>
                  </Popup>
                </CircleMarker>
              ))}

              {existingNpcPoints.map((point) => (
                <CircleMarker
                  key={point.id}
                  center={gameToMap(mapConfig, point.position[0], point.position[2])}
                  radius={5}
                  pathOptions={{ color: '#7c3aed', fillColor: '#8b5cf6', fillOpacity: 0.75, weight: 1 }}
                >
                  <Popup>
                    <div className="text-sm">
                      <div className="font-semibold">{point.label}</div>
                      <div className="text-xs text-surface-500">{formatPosition(point.position)}</div>
                    </div>
                  </Popup>
                </CircleMarker>
              ))}

              {draftObjectivePoints.length > 1 && (
                <Polyline
                  positions={draftObjectivePoints.map((point) => gameToMap(mapConfig, point.position[0], point.position[2]))}
                  pathOptions={{ color: '#f97316', weight: 3, opacity: 0.9 }}
                />
              )}

              {draftObjectivePoints.map((point) => (
                <CircleMarker
                  key={point.id}
                  center={gameToMap(mapConfig, point.position[0], point.position[2])}
                  radius={8}
                  pathOptions={{ color: '#c2410c', fillColor: '#f97316', fillOpacity: 0.92, weight: 3 }}
                >
                  <Popup>
                    <div className="text-sm">
                      <div className="font-semibold">{point.label}</div>
                      <div className="text-xs text-surface-500">{formatPosition(point.position)}</div>
                    </div>
                  </Popup>
                </CircleMarker>
              ))}

              {draftNpcPoint && (
                <CircleMarker
                  center={gameToMap(mapConfig, draftNpcPoint[0], draftNpcPoint[2])}
                  radius={8}
                  pathOptions={{ color: '#6d28d9', fillColor: '#a855f7', fillOpacity: 0.95, weight: 3 }}
                >
                  <Popup>
                    <div className="text-sm">
                      <div className="font-semibold">{npcDraft?.NPCName || 'Quest NPC draft'}</div>
                      <div className="text-xs text-surface-500">{formatPosition(draftNpcPoint)}</div>
                    </div>
                  </Popup>
                </CircleMarker>
              )}
            </MapContainer>
          </div>

          <div className="space-y-3">
            <div className="rounded-xl border border-surface-200 bg-surface-50 p-4">
              <div className="text-xs font-semibold uppercase tracking-wide text-surface-500">Plot target</div>
              <div className="mt-2 text-sm font-semibold text-surface-900">
                {plotTarget === 'npc' ? npcDraft?.NPCName || 'Quest NPC draft' : objectiveDraft?.ObjectiveText || 'Objective draft'}
              </div>
              <div className="mt-1 text-xs text-surface-500">
                {plotTarget === 'npc'
                  ? `Position: ${formatPosition(npcDraft?.Position)}`
                  : canPlotObjective
                    ? `${draftObjectivePoints.length || 0} plotted point${draftObjectivePoints.length === 1 ? '' : 's'}`
                    : 'This objective type does not use map coordinates.'}
              </div>
            </div>
            <div className="rounded-xl border border-surface-200 bg-white p-4">
              <div className="text-xs font-semibold uppercase tracking-wide text-surface-500">Map settings</div>
              <div className="mt-2 space-y-1 text-sm text-surface-700">
                <div>{mapConfig.worldSizeX} x {mapConfig.worldSizeZ}</div>
                <div>{mapConfig.invertX ? 'X inverted' : 'X normal'} · {mapConfig.invertZ ? 'Z inverted' : 'Z normal'}</div>
                {mapLoading && <div className="text-surface-500">Loading map config...</div>}
              </div>
            </div>
            {lastPlottedPoint && (
              <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-800">
                Last plotted: {Math.round(lastPlottedPoint.x)}, {Math.round(lastPlottedPoint.y)}, {Math.round(lastPlottedPoint.z)}
              </div>
            )}
            <div className="rounded-xl border border-surface-200 bg-white p-4 text-xs leading-relaxed text-surface-500">
              Existing objectives are blue, existing NPCs are purple, the active objective draft is orange, and the active NPC draft is violet.
            </div>
          </div>
        </div>
      </Card>

      <div className="grid gap-5 xl:grid-cols-[340px_minmax(0,1fr)_360px]">
        <Card compact>
          <div className="mb-4 flex items-center justify-between gap-3">
            <div>
              <div className="font-semibold text-surface-900">Quest Files</div>
              <div className="text-xs text-surface-500">ExpansionMod/Quests/Quests</div>
            </div>
            <Badge variant="info">{filteredQuests.length}</Badge>
          </div>
          <div className="relative mb-4">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-surface-400" />
            <TextInput
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search quests"
              className="pl-9"
            />
          </div>
          <div className="max-h-[760px] space-y-2 overflow-y-auto pr-1">
            {filteredQuests.map((item) => (
              <button
                key={item.fileName}
                type="button"
                onClick={() => {
                  setMode('edit');
                  setSelectedFile(item.fileName);
                }}
                className={`w-full rounded-xl border p-3 text-left transition ${
                  selectedFile === item.fileName && mode === 'edit'
                    ? 'border-surface-500 bg-surface-100'
                    : 'border-surface-200 bg-white hover:bg-surface-50'
                }`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="truncate font-semibold text-surface-900">{item.title}</div>
                    <div className="mt-1 font-mono text-xs text-surface-500">{item.fileName}</div>
                  </div>
                  <Badge variant={item.active ? 'success' : 'default'}>{item.active ? 'On' : 'Off'}</Badge>
                </div>
                <div className="mt-2 flex flex-wrap gap-1 text-xs text-surface-500">
                  <span>{item.objectiveCount} objectives</span>
                  <span>·</span>
                  <span>{item.rewardCount} rewards</span>
                  {item.repeatable && <span>· repeatable</span>}
                </div>
              </button>
            ))}
            {!loading && filteredQuests.length === 0 && (
              <div className="rounded-xl border border-dashed border-surface-200 p-6 text-center text-sm text-surface-500">
                No quests found.
              </div>
            )}
          </div>
        </Card>

        <Card compact>
          {!quest ? (
            <div className="flex min-h-[520px] flex-col items-center justify-center text-center text-surface-500">
              <FileJson size={44} className="mb-4 text-surface-300" />
              Select a quest or create a new one.
            </div>
          ) : (
            <div className="space-y-5">
              <div className="flex flex-wrap items-start justify-between gap-3 border-b border-surface-100 pb-4">
                <div>
                  <div className="flex items-center gap-2">
                    <h2 className="text-xl font-semibold text-surface-900">{quest.Title || `Quest ${quest.ID}`}</h2>
                    <Badge variant={mode === 'new' ? 'warning' : 'info'}>{mode === 'new' ? 'New' : selectedFile}</Badge>
                  </div>
                  <div className="mt-1 text-xs text-surface-500">Saves to {selectedFile || `Quest_${quest.ID}.json`}</div>
                </div>
                <div className="flex gap-2">
                  <Button
                    variant="secondary"
                    icon={<Trash2 size={15} />}
                    loading={saving}
                    disabled={mode === 'new' || !selectedFile}
                    onClick={handleDeleteQuest}
                  >
                    Delete
                  </Button>
                  <Button icon={<Save size={15} />} loading={saving} onClick={handleSaveQuest}>
                    Save Quest
                  </Button>
                </div>
              </div>

              <div className="grid gap-3 lg:grid-cols-[120px_minmax(0,1fr)_160px]">
                <Field label="ID">
                  <TextInput type="number" value={quest.ID} onChange={(event) => setQuestField('ID', intValue(event.target.value, quest.ID))} />
                </Field>
                <Field label="Title">
                  <TextInput value={quest.Title} onChange={(event) => setQuestField('Title', event.target.value)} />
                </Field>
                <Field label="Follow-up ID">
                  <TextInput type="number" value={quest.FollowUpQuest ?? -1} onChange={(event) => setQuestField('FollowUpQuest', intValue(event.target.value, -1))} />
                </Field>
              </div>

              <Field label="Objective Text">
                <TextInput value={quest.ObjectiveText || ''} onChange={(event) => setQuestField('ObjectiveText', event.target.value)} />
              </Field>

              <div className="flex flex-wrap gap-2">
                <Toggle label="Active" checked={isEnabled(quest.Active)} onChange={(value) => setQuestField('Active', boolToFlag(value))} />
                <Toggle label="Repeatable" checked={isEnabled(quest.Repeatable)} onChange={(value) => setQuestField('Repeatable', boolToFlag(value))} />
                <Toggle label="Daily" checked={isEnabled(quest.IsDailyQuest)} onChange={(value) => setQuestField('IsDailyQuest', boolToFlag(value))} />
                <Toggle label="Weekly" checked={isEnabled(quest.IsWeeklyQuest)} onChange={(value) => setQuestField('IsWeeklyQuest', boolToFlag(value))} />
                <Toggle label="Group Quest" checked={isEnabled(quest.IsGroupQuest)} onChange={(value) => setQuestField('IsGroupQuest', boolToFlag(value))} />
                <Toggle label="Sequential" checked={isEnabled(quest.SequentialObjectives)} onChange={(value) => setQuestField('SequentialObjectives', boolToFlag(value))} />
              </div>

              <div className="grid gap-3 lg:grid-cols-3">
                <Field label="Quest Giver IDs" hint="NPC IDs, comma separated">
                  <TextInput value={idsToText(quest.QuestGiverIDs)} onChange={(event) => setQuestField('QuestGiverIDs', parseIds(event.target.value))} />
                </Field>
                <Field label="Turn-in IDs" hint="NPC IDs, comma separated">
                  <TextInput value={idsToText(quest.QuestTurnInIDs)} onChange={(event) => setQuestField('QuestTurnInIDs', parseIds(event.target.value))} />
                </Field>
                <Field label="Pre-quest IDs" hint="Quest IDs, comma separated">
                  <TextInput value={idsToText(quest.PreQuestIDs)} onChange={(event) => setQuestField('PreQuestIDs', parseIds(event.target.value))} />
                </Field>
              </div>

              <div className="grid gap-3 lg:grid-cols-3">
                {(quest.Descriptions || ['', '', '']).slice(0, 3).map((description, index) => (
                  <Field key={index} label={index === 0 ? 'Start Text' : index === 1 ? 'Progress Text' : 'Completion Text'}>
                    <TextArea
                      rows={5}
                      value={description || ''}
                      onChange={(event) => {
                        updateQuest((current) => {
                          const descriptions = [...(current.Descriptions || ['', '', ''])];
                          descriptions[index] = event.target.value;
                          current.Descriptions = descriptions;
                          return current;
                        });
                      }}
                    />
                  </Field>
                ))}
              </div>

              <div className="rounded-xl border border-surface-200 bg-surface-50 p-4">
                <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <div className="font-semibold text-surface-900">Quest Objectives</div>
                    <div className="text-xs text-surface-500">References objective files by ID and type</div>
                  </div>
                  <div className="flex gap-2">
                    <select
                      value={selectedObjectiveRef}
                      onChange={(event) => setSelectedObjectiveRef(event.target.value)}
                      className="max-w-[300px] rounded-xl border border-surface-200 bg-white px-3 py-2 text-sm"
                    >
                      <option value="">Select objective</option>
                      {(summary?.objectives || []).map((objective) => (
                        <option key={`${objective.objectiveType}:${objective.fileName}`} value={`${objective.objectiveType}:${objective.fileName}`}>
                          {objectiveLabel(objective)}
                        </option>
                      ))}
                    </select>
                    <Button variant="secondary" size="sm" icon={<Plus size={14} />} disabled={!selectedObjective} onClick={handleAddObjectiveRef}>
                      Add
                    </Button>
                  </div>
                </div>
                <div className="space-y-2">
                  {(quest.Objectives || []).map((objective, index) => (
                    <div key={`${objective.ObjectiveType}-${objective.ID}-${index}`} className="flex items-center justify-between gap-3 rounded-lg border border-surface-200 bg-white px-3 py-2">
                      <div className="text-sm">
                        <span className="font-semibold text-surface-900">Objective {objective.ID}</span>
                        <span className="ml-2 text-surface-500">Type {objective.ObjectiveType}</span>
                      </div>
                      <button
                        type="button"
                        onClick={() => updateQuest((current) => {
                          current.Objectives.splice(index, 1);
                          return current;
                        })}
                        className="rounded-lg p-1.5 text-surface-400 hover:bg-red-50 hover:text-red-600"
                      >
                        <Trash2 size={15} />
                      </button>
                    </div>
                  ))}
                  {(quest.Objectives || []).length === 0 && (
                    <div className="rounded-lg border border-dashed border-surface-200 bg-white p-4 text-sm text-surface-500">
                      No objectives linked yet. Create or select an objective from the sidebar.
                    </div>
                  )}
                </div>
              </div>

              <div className="grid gap-4 lg:grid-cols-2">
                <div className="rounded-xl border border-surface-200 p-4">
                  <div className="mb-3 flex items-center justify-between">
                    <div className="font-semibold text-surface-900">Rewards</div>
                    <Button
                      variant="secondary"
                      size="sm"
                      icon={<Plus size={14} />}
                      onClick={() => updateQuest((current) => {
                        current.Rewards = [...(current.Rewards || []), { ClassName: 'Apple', Amount: 1, Attachments: [], DamagePercent: 0, HealthPercent: 0, QuestID: -1, Chance: 1 }];
                        return current;
                      })}
                    >
                      Add
                    </Button>
                  </div>
                  <div className="space-y-2">
                    {(quest.Rewards || []).map((reward, index) => (
                      <div key={index} className="grid grid-cols-[minmax(0,1fr)_82px_32px] gap-2">
                        <TextInput value={reward.ClassName || ''} onChange={(event) => updateQuest((current) => {
                          current.Rewards[index] = { ...current.Rewards[index], ClassName: event.target.value };
                          return current;
                        })} />
                        <TextInput type="number" value={reward.Amount || 1} onChange={(event) => updateQuest((current) => {
                          current.Rewards[index] = { ...current.Rewards[index], Amount: intValue(event.target.value, 1) };
                          return current;
                        })} />
                        <button
                          type="button"
                          onClick={() => updateQuest((current) => {
                            current.Rewards.splice(index, 1);
                            return current;
                          })}
                          className="rounded-lg p-2 text-surface-400 hover:bg-red-50 hover:text-red-600"
                        >
                          <Trash2 size={15} />
                        </button>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="rounded-xl border border-surface-200 p-4">
                  <div className="mb-3 flex items-center justify-between">
                    <div className="font-semibold text-surface-900">Quest Items</div>
                    <Button
                      variant="secondary"
                      size="sm"
                      icon={<Plus size={14} />}
                      onClick={() => updateQuest((current) => {
                        current.QuestItems = [...(current.QuestItems || []), { ClassName: 'Apple', Amount: 1 }];
                        return current;
                      })}
                    >
                      Add
                    </Button>
                  </div>
                  <div className="space-y-2">
                    {(quest.QuestItems || []).map((item, index) => (
                      <div key={index} className="grid grid-cols-[minmax(0,1fr)_82px_32px] gap-2">
                        <TextInput value={item.ClassName || ''} onChange={(event) => updateQuest((current) => {
                          current.QuestItems[index] = { ...current.QuestItems[index], ClassName: event.target.value };
                          return current;
                        })} />
                        <TextInput type="number" value={item.Amount || 1} onChange={(event) => updateQuest((current) => {
                          current.QuestItems[index] = { ...current.QuestItems[index], Amount: intValue(event.target.value, 1) };
                          return current;
                        })} />
                        <button
                          type="button"
                          onClick={() => updateQuest((current) => {
                            current.QuestItems.splice(index, 1);
                            return current;
                          })}
                          className="rounded-lg p-2 text-surface-400 hover:bg-red-50 hover:text-red-600"
                        >
                          <Trash2 size={15} />
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              <div className="rounded-xl border border-surface-200 bg-surface-950 p-4">
                <div className="mb-3 flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2 text-sm font-semibold text-white">
                    <FileJson size={16} />
                    Raw Quest JSON
                  </div>
                  <Button variant="secondary" size="sm" onClick={handleJsonApply}>Apply JSON</Button>
                </div>
                {jsonError && <div className="mb-3 rounded-lg bg-red-500/15 px-3 py-2 text-sm text-red-100">{jsonError}</div>}
                <textarea
                  value={questJson}
                  onChange={(event) => setQuestJson(event.target.value)}
                  spellCheck={false}
                  className="h-[360px] w-full resize-y rounded-lg border border-white/10 bg-surface-900 p-3 font-mono text-xs leading-relaxed text-surface-100 outline-none focus:border-white/30"
                />
              </div>
            </div>
          )}
        </Card>

        <div className="space-y-5">
          <Card compact>
            <div className="mb-3 flex items-center justify-between gap-3">
              <div className="flex items-center gap-2 font-semibold text-surface-900">
                <MapPin size={16} />
                Objectives
              </div>
              <Button size="sm" variant="secondary" icon={<Plus size={14} />} onClick={handleNewObjective}>
                New
              </Button>
            </div>
            <div className="space-y-2">
              <select
                value={objectiveType}
                onChange={(event) => changeObjectiveType(Number(event.target.value))}
                disabled={Boolean(objectiveFile)}
                className="w-full rounded-xl border border-surface-200 bg-surface-50 px-3 py-2 text-sm disabled:text-surface-400"
              >
                {(templates?.objectiveTypes || []).map((type) => (
                  <option key={type.type} value={type.type}>{type.label}</option>
                ))}
              </select>
              {objectiveFile && (
                <div className="rounded-lg border border-surface-200 bg-surface-50 px-3 py-2 font-mono text-xs text-surface-600">
                  Editing {objectiveFile}
                </div>
              )}
              <TextInput
                type="number"
                value={objectiveDraft?.ID || ''}
                onChange={(event) => setObjectiveDraft((current) => current ? { ...current, ID: intValue(event.target.value, current.ID) } : current)}
                placeholder="Objective ID"
              />
              <TextInput
                value={objectiveDraft?.ObjectiveText || ''}
                onChange={(event) => setObjectiveDraft((current) => current ? { ...current, ObjectiveText: event.target.value } : current)}
                placeholder="Objective text"
              />
              {(objectiveDraft?.Position || objectiveType === 2 || objectiveType === 3) && (
                <div className="grid grid-cols-3 gap-2">
                  {[0, 1, 2].map((index) => (
                    <TextInput
                      key={index}
                      type="number"
                      value={objectiveDraft?.Position?.[index] ?? 0}
                      onChange={(event) => setObjectiveDraft((current) => {
                        if (!current) return current;
                        const position = [...(current.Position || [0, 0, 0])];
                        position[index] = numberValue(event.target.value, 0);
                        return { ...current, Position: position };
                      })}
                      placeholder={['X', 'Y', 'Z'][index]}
                    />
                  ))}
                </div>
              )}
              {(objectiveType === 2 || objectiveType === 10) && (
                <TextInput
                  type="number"
                  value={objectiveDraft?.Amount ?? objectiveDraft?.ExecutionAmount ?? 1}
                  onChange={(event) => setObjectiveDraft((current) => {
                    if (!current) return current;
                    return objectiveType === 10
                      ? { ...current, ExecutionAmount: intValue(event.target.value, 1) }
                      : { ...current, Amount: intValue(event.target.value, 1) };
                  })}
                  placeholder="Amount"
                />
              )}
              {(objectiveType === 4 || objectiveType === 5) && (
                <div className="grid grid-cols-[minmax(0,1fr)_90px] gap-2">
                  <TextInput
                    value={objectiveDraft?.Collections?.[0]?.ClassName || 'Apple'}
                    onChange={(event) => setObjectiveDraft((current) => {
                      if (!current) return current;
                      const collections = [...(current.Collections || [{ Amount: 1, ClassName: 'Apple', QuantityPercent: -1, MinQuantityPercent: -1 }])];
                      collections[0] = { ...collections[0], ClassName: event.target.value };
                      return { ...current, Collections: collections };
                    })}
                    placeholder="ClassName"
                  />
                  <TextInput
                    type="number"
                    value={objectiveDraft?.Collections?.[0]?.Amount || 1}
                    onChange={(event) => setObjectiveDraft((current) => {
                      if (!current) return current;
                      const collections = [...(current.Collections || [{ Amount: 1, ClassName: 'Apple', QuantityPercent: -1, MinQuantityPercent: -1 }])];
                      collections[0] = { ...collections[0], Amount: intValue(event.target.value, 1) };
                      return { ...current, Collections: collections };
                    })}
                    placeholder="Amount"
                  />
                </div>
              )}
              <div className="grid grid-cols-2 gap-2">
                <Button className="w-full" icon={<Save size={15} />} loading={saving} disabled={!objectiveDraft} onClick={handleSaveObjective}>
                  {objectiveFile ? 'Save' : 'Create'}
                </Button>
                <Button className="w-full" variant="secondary" icon={<Trash2 size={15} />} loading={saving} disabled={!objectiveFile} onClick={() => void handleDeleteObjective()}>
                  Delete
                </Button>
              </div>
            </div>
            <div className="mt-4 max-h-[280px] space-y-2 overflow-y-auto pr-1">
              {(summary?.objectives || []).slice(0, 20).map((objective) => (
                <div key={`${objective.objectiveType}:${objective.fileName}`} className="rounded-lg border border-surface-200 bg-surface-50 p-3">
                  <div className="flex items-center justify-between gap-2">
                    <button
                      type="button"
                      onClick={() => void handleLoadObjective(objective)}
                      className="min-w-0 truncate text-left text-sm font-semibold text-surface-900 hover:text-primary-700"
                    >
                      {objective.text}
                    </button>
                    <Badge variant={objective.active ? 'success' : 'default'}>{objective.id}</Badge>
                  </div>
                  <div className="mt-1 text-xs text-surface-500">{objective.objectiveTypeLabel} · {formatPosition(objective.position)}</div>
                  <div className="mt-2 flex gap-2">
                    <Button size="sm" variant="secondary" onClick={() => void handleLoadObjective(objective)}>
                      Edit
                    </Button>
                    <Button
                      size="sm"
                      variant="secondary"
                      icon={<Trash2 size={13} />}
                      onClick={() => void handleDeleteObjective({ ObjectiveType: objective.objectiveType } as ExpansionQuestObjectiveConfig, objective.fileName)}
                    >
                      Delete
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          </Card>

          <Card compact>
            <div className="mb-3 flex items-center justify-between gap-3">
              <div className="flex items-center gap-2 font-semibold text-surface-900">
                <UserRound size={16} />
                Quest NPCs
              </div>
              <Button size="sm" variant="secondary" icon={<Plus size={14} />} onClick={handleNewNpc}>
                New
              </Button>
            </div>
            <div className="space-y-2">
              {npcFile && (
                <div className="rounded-lg border border-surface-200 bg-surface-50 px-3 py-2 font-mono text-xs text-surface-600">
                  Editing {npcFile}
                </div>
              )}
              <TextInput
                type="number"
                value={npcDraft?.ID || ''}
                onChange={(event) => setNpcDraft((current) => current ? { ...current, ID: intValue(event.target.value, current.ID) } : current)}
                placeholder="NPC ID"
              />
              <TextInput
                value={npcDraft?.NPCName || ''}
                onChange={(event) => setNpcDraft((current) => current ? { ...current, NPCName: event.target.value } : current)}
                placeholder="NPC name"
              />
              <TextInput
                value={npcDraft?.ClassName || ''}
                onChange={(event) => setNpcDraft((current) => current ? { ...current, ClassName: event.target.value } : current)}
                placeholder="NPC class"
              />
              <div className="grid grid-cols-3 gap-2">
                {[0, 1, 2].map((index) => (
                  <TextInput
                    key={index}
                    type="number"
                    value={npcDraft?.Position?.[index] ?? 0}
                    onChange={(event) => setNpcDraft((current) => {
                      if (!current) return current;
                      const position = [...(current.Position || [0, 0, 0])];
                      position[index] = numberValue(event.target.value, 0);
                      return { ...current, Position: position, Waypoints: [position] };
                    })}
                    placeholder={['X', 'Y', 'Z'][index]}
                  />
                ))}
              </div>
              <div className="grid grid-cols-2 gap-2">
                <Button className="w-full" icon={<Bot size={15} />} loading={saving} disabled={!npcDraft} onClick={handleSaveNpc}>
                  {npcFile ? 'Save' : 'Create'}
                </Button>
                <Button className="w-full" variant="secondary" icon={<Trash2 size={15} />} loading={saving} disabled={!npcFile} onClick={() => void handleDeleteNpc()}>
                  Delete
                </Button>
              </div>
            </div>
            <div className="mt-4 max-h-[260px] space-y-2 overflow-y-auto pr-1">
              {(summary?.npcs || []).map((npc) => (
                <div key={npc.fileName} className="rounded-lg border border-surface-200 bg-surface-50 p-3">
                  <div className="flex items-center justify-between gap-2">
                    <button
                      type="button"
                      onClick={() => void handleLoadNpc(npc)}
                      className="min-w-0 truncate text-left text-sm font-semibold text-surface-900 hover:text-primary-700"
                    >
                      {npc.name}
                    </button>
                    <Badge variant={npc.active ? 'success' : 'default'}>{npc.id}</Badge>
                  </div>
                  <div className="mt-1 text-xs text-surface-500">{npc.className || 'NPC'} · {formatPosition(npc.position)}</div>
                  <div className="mt-2 flex gap-2">
                    <Button size="sm" variant="secondary" onClick={() => void handleLoadNpc(npc)}>
                      Edit
                    </Button>
                    <Button size="sm" variant="secondary" icon={<Trash2 size={13} />} onClick={() => void handleDeleteNpc(npc.fileName)}>
                      Delete
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
};

export default QuestDesigner;
