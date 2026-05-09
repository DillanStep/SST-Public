/**
 * @file SST_ATMExportManager.c
 * @brief Shared JSON DTOs used by SST server-side exporters and API queues.
 *
 * This file intentionally contains multiple JSON-serializable "data model"
 * classes used by:
 * - inventory exporting
 * - inventory/life event logging
 * - item grant/delete queues
 * - online player tracking
 *
 * These are pure data containers (no runtime logic) meant for JsonFileLoader.
 */

// Represents a single inventory item (recursive attachments/cargo).
class SST_InventoryItemData
{
	string className;          // Item type/class name (e.g., "AKM", "Apple")
	string displayName;        // Human-readable name
	float health;              // Current health (0-100%)
	float quantity;            // Current quantity (ammo count for magazines, liquid amount, etc.)
	float quantityMax;         // Maximum quantity
	int slot;                  // Inventory slot ID (-1 if in cargo)
	string slotName;           // Slot name if attached (e.g., "Shoulder", "Head")
	ref array<ref SST_InventoryItemData> attachments = new array<ref SST_InventoryItemData>();  // Nested attachments
	ref array<ref SST_InventoryItemData> cargo = new array<ref SST_InventoryItemData>();        // Items in cargo
}

// Represents a player's full inventory export.
class SST_PlayerInventoryData
{
	string playerName;
	string playerId;           // Steam64 ID for display
	string biId;               // BI ID for internal reference
	ref array<ref SST_InventoryItemData> inventory = new array<ref SST_InventoryItemData>();
}

// Root export structure containing all players.
class SST_InventoryExportData
{
	string generatedAt;
	int playerCount;
	ref array<ref SST_PlayerInventoryData> players = new array<ref SST_PlayerInventoryData>();
}

// ============================================================================
// Inventory Event Logging Data Classes
// ============================================================================

// Types of inventory events
class SST_InventoryEventType
{
	static const string DROPPED = "DROPPED";           // Item dropped to ground
	static const string REMOVED = "REMOVED";           // Item removed from player (given, stored, etc.)
	static const string PICKED_UP = "PICKED_UP";       // Item picked up from ground
	static const string ADDED = "ADDED";               // Item added to player inventory
	static const string PLAYER_HIT = "PLAYER_HIT";     // Player damaged another player
}

// Single inventory event entry
class SST_InventoryEventData
{
	string timestamp;
	string eventType;          // DROPPED, REMOVED, PICKED_UP, ADDED
	string playerName;
	string playerId;           // Steam64
	string itemClassName;
	string itemDisplayName;
	float itemHealth;
	float itemQuantity;
	vector position;           // World position where event occurred
	string targetPlayerName;
	string targetPlayerId;
	string weapon;
	string ammo;
	string hitZone;
	string bodyPart;
	string damageZone;
	string hitComponent;
	float damage;
	float distance;
	float speedCoef;
}

// Log file structure for a player's events
class SST_PlayerInventoryEventsLog
{
	string playerName;
	string playerId;
	ref array<ref SST_InventoryEventData> events = new array<ref SST_InventoryEventData>();
}

// ============================================================================
// Player Life Event Data Classes (Death, Spawn, Connect, Disconnect)
// ============================================================================

class SST_PlayerLifeEventType
{
	static const string SPAWNED = "SPAWNED";           // Player spawned (new character)
	static const string RESPAWNED = "RESPAWNED";       // Player respawned after death
	static const string DIED = "DIED";                 // Player died
	static const string CONNECTED = "CONNECTED";       // Player connected to server
	static const string DISCONNECTED = "DISCONNECTED"; // Player disconnected from server
}

class SST_PlayerLifeEventData
{
	string timestamp;
	string eventType;
	string playerName;
	string playerId;
	string targetPlayerName;
	string targetPlayerId;
	vector position;
	string causeOfDeath;       // Only for death events - killer info
	float healthAtDeath;       // Only for death events
	string weapon;
	string ammo;
	string hitZone;
	string bodyPart;
	string damageZone;
	string hitComponent;
	float damage;
	float distance;
}

class SST_PlayerLifeEventsLog
{
	string playerName;
	string playerId;
	ref array<ref SST_PlayerLifeEventData> events = new array<ref SST_PlayerLifeEventData>();
}

// ============================================================================
// Item Grant API Data Classes
// ============================================================================

// Single item grant request
class SST_ItemGrantRequest
{
	string playerId;           // Steam64 ID of player to grant item to
	string itemClassName;      // Item class name to spawn
	int quantity;              // Quantity (for stackable items) or 1
	float health;              // Health percentage (0-100), -1 for default
	bool processed;            // Set to true after processing
	string result;             // "SUCCESS" or error message
}

// Queue of pending item grants
class SST_ItemGrantQueue
{
	ref array<ref SST_ItemGrantRequest> requests = new array<ref SST_ItemGrantRequest>();
}

// ============================================================================
// Item Delete API Data Classes
// ============================================================================

// Single item delete request
class SST_ItemDeleteRequest
{
	string requestId;          // Unique request ID
	string playerId;           // Steam64 ID of player
	string itemClassName;      // Item class name to delete
	string itemPath;           // Path to item (e.g., "0.cargo.2" = first slot, cargo, index 2)
	int deleteCount;           // How many to delete (for stackables, 0 = all)
	string requestedAt;        // When the request was made
	bool processed;            // Set to true after processing
	string status;             // "pending", "completed", "failed"
	string result;             // Result message
}

// Queue of pending item deletes
class SST_ItemDeleteQueue
{
	ref array<ref SST_ItemDeleteRequest> requests = new array<ref SST_ItemDeleteRequest>();
}

// ============================================================================
// Expansion ATM Admin Queue
// ============================================================================

class SST_ExpansionATMCommandRequest
{
	string requestId;
	string commandType;        // "setAtmBalance" or "reloadAtmBalances"
	string playerId;           // Expansion/BI PlayerID used by Expansion ATM files
	int balance;
	int amount;
	int previousBalance;
	string reason;
	string requestedAt;
	bool processed;
	string status;             // "pending", "completed", "failed"
	string result;
}

class SST_ExpansionATMCommandQueue
{
	ref array<ref SST_ExpansionATMCommandRequest> requests = new array<ref SST_ExpansionATMCommandRequest>();
}

// ============================================================================
// Server Item List Data Classes
// ============================================================================

// Single item entry in the server item list
class SST_ServerItemEntry
{
	string className;          // Item class name for spawning
	string displayName;        // Human-readable name
	string category;           // Category (weapons, clothing, food, etc.)
	string parentClass;        // Parent class name
	bool canBeStacked;         // Whether item can stack (has quantity)
	int maxQuantity;           // Max stack size / ammo capacity
}

// Complete list of all spawnable items on the server
class SST_ServerItemList
{
	string generatedAt;
	int itemCount;
	ref array<ref SST_ServerItemEntry> items = new array<ref SST_ServerItemEntry>();
}

class SST_ModInfo
{
	static const string VERSION = "1.0.7";
	static const string PROTOCOL_VERSION = "1";
}

// ============================================================================
// Online Player Tracking Data Classes
// ============================================================================

// Single online player entry with location data
class SST_OnlinePlayerData
{
	string playerId;           // Steam64 ID
	string playerName;         // In-game name
	string biId;               // BI ID
	bool isOnline;             // Currently online
	string connectedAt;        // Timestamp when connected
	string lastUpdate;         // Last position update timestamp
	float posX;                // World X position
	float posY;                // World Y (height) position
	float posZ;                // World Z position
	float health;              // Current health (0-100)
	float blood;               // Current blood (0-5000)
	float water;               // Current water level
	float energy;              // Current food/energy level
	bool isAlive;              // Is character alive
	bool isUnconscious;        // Is character unconscious
}

// List of all tracked players (online and recently disconnected)
class SST_OnlinePlayersData
{
	string generatedAt;
	string modVersion;
	string protocolVersion;
	int onlineCount;
	ref array<ref SST_OnlinePlayerData> players = new array<ref SST_OnlinePlayerData>();
}

// ============================================================================
// Expansion AI Tracking Data Classes
// ============================================================================

// Single Expansion AI entry with live location data
class SST_AIPositionData
{
	string aiId;
	string displayName;
	string typeName;
	string faction;
	string groupName;
	string lastUpdate;
	float posX;
	float posY;
	float posZ;
	float health;
	bool isAlive;
	bool isUnconscious;
}

// List of currently tracked Expansion AI units
class SST_AIPositionsData
{
	string generatedAt;
	string modVersion;
	string protocolVersion;
	int aiCount;
	ref array<ref SST_AIPositionData> ai = new array<ref SST_AIPositionData>();
}
