import express from 'express';
import { paths } from '../config.js';
import { readFile } from "../storage/fs.js";

const router = express.Router();

// Helper function to transform player data to expected format
function transformPlayer(p) {
  return {
    playerId: p.playerId,
    playerName: p.playerName,
    biId: p.biId,
    isOnline: p.isOnline === 1 || p.isOnline === true,
    connectedAt: p.connectedAt,
    lastUpdate: p.lastUpdate,
    position: {
      x: p.posX || 0,
      y: p.posY || 0,
      z: p.posZ || 0
    },
    health: p.health || 0,
    blood: p.blood || 0,
    water: p.water || 0,
    energy: p.energy || 0,
    isAlive: p.isAlive === 1 || p.isAlive === true,
    isUnconscious: p.isUnconscious === 1 || p.isUnconscious === true
  };
}

// Helper function to read online players file
async function getOnlinePlayers() {
  try {
    const data = await readFile(paths.onlinePlayers, "utf-8");
    return JSON.parse(data);
  } catch (error) {
    if (error.code === 'ENOENT') {
      return { generatedAt: null, onlineCount: 0, players: [] };
    }
    throw error;
  }
}

// GET /online - Get all players (online and offline)
router.get('/', async (req, res) => {
  try {
    const data = await getOnlinePlayers();
    res.json({
      generatedAt: data.generatedAt,
      onlineCount: data.onlineCount,
      players: (data.players || []).map(transformPlayer)
    });
  } catch (error) {
    res.status(500).json({ error: 'Failed to read online players', details: error.message });
  }
});

// GET /online/active - Get only currently online players
router.get('/active', async (req, res) => {
  try {
    const data = await getOnlinePlayers();
    const activePlayers = (data.players || [])
      .filter(p => p.isOnline === 1 || p.isOnline === true)
      .map(transformPlayer);
    res.json({
      generatedAt: data.generatedAt,
      onlineCount: activePlayers.length,
      players: activePlayers
    });
  } catch (error) {
    res.status(500).json({ error: 'Failed to read online players', details: error.message });
  }
});

// GET /online/:playerId - Get specific player's online status and location
router.get('/:playerId', async (req, res) => {
  try {
    const { playerId } = req.params;
    const data = await getOnlinePlayers();
    
    const player = (data.players || []).find(p => p.playerId === playerId);
    
    if (!player) {
      return res.status(404).json({ error: 'Player not found in tracking data' });
    }
    
    res.json({
      generatedAt: data.generatedAt,
      player: transformPlayer(player)
    });
  } catch (error) {
    res.status(500).json({ error: 'Failed to read player data', details: error.message });
  }
});

// GET /online/locations/all - Get all online player locations (for map view)
router.get('/locations/all', async (req, res) => {
  try {
    const data = await getOnlinePlayers();
    const locations = (data.players || [])
      .filter(p => p.isOnline === 1 || p.isOnline === true)
      .map(p => ({
        playerId: p.playerId,
        playerName: p.playerName,
        x: p.posX || 0,
        y: p.posY || 0,
        z: p.posZ || 0,
        health: p.health || 0,
        isAlive: p.isAlive === 1 || p.isAlive === true,
        lastUpdate: p.lastUpdate
      }));
    
    res.json({
      timestamp: data.generatedAt,
      onlineCount: locations.length,
      locations
    });
  } catch (error) {
    res.status(500).json({ error: 'Failed to read player locations', details: error.message });
  }
});

export default router;
