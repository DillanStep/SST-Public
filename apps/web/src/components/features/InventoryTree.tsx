import React, { useState } from 'react';
import { ChevronRight, ChevronDown, Package, Paperclip, Box, Droplets, Utensils, Trash2 } from 'lucide-react';
import { Button } from '../ui';
import type { InventoryItem } from '../../types';
import { flattenInventory } from './inventoryUtils';

// Item type categorization for proper quantity display
const STACKABLE_ITEMS = [
  // Rags and medical
  'rag', 'bandage', 'sewing', 'duct_tape', 'fishing_hook', 'fishinghook', 'bone',
  // Ammo
  'ammo_', '_ammo', 'mag_', '_mag', 'bullet', 'shell', 'round',
  // Crafting
  'nail', 'metal_wire', 'rope', 'bark', 'stick', 'stone', 'feather', 'guts', 'fat', 'pelt',
  // Money - vanilla and Expansion
  'money', 'ruble', 'banknote', 'hryvnia', 'expansionbanknote', 'goldbar', 'silverbar',
  'goldnugget', 'silvernugget'
];

const LIQUID_CONTAINERS = [
  'waterbottle', 'canteen', 'pot', 'cauldron', 'barrel', 'jerrycan', 'gascan', 
  'bloodbag', 'saline', 'iv_', '_iv', 'bottle', 'flask', 'canister', 'container',
  'cooking', 'fryingpan'
];

const CONSUMABLE_FOODS = [
  'apple', 'pear', 'plum', 'banana', 'orange', 'kiwi', 'tomato', 'pepper', 'potato', 'zucchini',
  'mushroom', 'berry', 'meat', 'steak', 'fat', 'lard', 'fish', 'carp', 'mackerel', 'sardine',
  'tuna', 'brisket', 'kvass', 'soda', 'cola', 'spite', 'pipsi', 'nota', 'franta',
  'powdered', 'cereal', 'rice', 'oatmeal', 'pasta', 'spaghetti', 'peach', 'bacon', 'tactical',
  'sardines', 'beans', 'unknown', 'dog', 'cat', 'chicken', 'boar', 'deer', 'cow', 'sheep',
  'wolf', 'bear', 'human', 'worm', 'snack', 'chocolate', 'crackers'
];

// Determine how to display quantity based on item type
function getQuantityDisplay(item: InventoryItem): { type: 'none' | 'stack' | 'liquid' | 'food'; display: string; percent?: number } | null {
  const className = item.className.toLowerCase();
  const quantityMax = item.quantityMax || 0;
  
  // No quantity to display
  if (item.quantity === 0 && quantityMax === 0) {
    return null;
  }
  
  // Check for stackable items (show as count)
  if (STACKABLE_ITEMS.some(s => className.includes(s))) {
    if (quantityMax > 1 && item.quantity > 0) {
      return { 
        type: 'stack', 
        display: `${Math.round(item.quantity)}/${Math.round(quantityMax)}` 
      };
    }
    if (item.quantity > 0) {
      return { type: 'stack', display: `x${Math.round(item.quantity)}` };
    }
    return null;
  }
  
  // Check for liquid containers (show as ml or percentage)
  if (LIQUID_CONTAINERS.some(s => className.includes(s))) {
    if (quantityMax > 0 && item.quantity > 0) {
      const percent = Math.round((item.quantity / quantityMax) * 100);
      return { 
        type: 'liquid', 
        display: `${Math.round(item.quantity)}ml`,
        percent 
      };
    }
    if (item.quantity === 0 && quantityMax > 0) {
      return { type: 'liquid', display: 'Empty', percent: 0 };
    }
    return null;
  }
  
  // Check for consumable foods (show as percentage freshness)
  if (CONSUMABLE_FOODS.some(s => className.includes(s))) {
    if (quantityMax > 0 && item.quantity > 0) {
      const percent = Math.round((item.quantity / quantityMax) * 100);
      return { 
        type: 'food', 
        display: `${percent}%`,
        percent 
      };
    }
    return null;
  }
  
  // Default: if quantity > 0 and it looks like a count (small numbers), show as stack
  if (item.quantity > 0 && item.quantity <= 100 && quantityMax <= 100) {
    if (quantityMax > 1) {
      return { 
        type: 'stack', 
        display: `${Math.round(item.quantity)}/${Math.round(quantityMax)}` 
      };
    }
    return null;
  }
  
  // For larger quantities, assume it's a consumable with percentage
  if (item.quantity > 0 && quantityMax > 0) {
    const percent = Math.round((item.quantity / quantityMax) * 100);
    return { 
      type: 'food', 
      display: `${percent}%`,
      percent 
    };
  }
  
  return null;
}

interface InventoryItemRowProps {
  item: InventoryItem;
  depth?: number;
  itemPath?: string;
  onGrant?: (className: string) => void;
  onDelete?: (className: string, itemPath: string, displayName: string) => void;
}

export const InventoryItemRow: React.FC<InventoryItemRowProps> = ({ 
  item, 
  depth = 0,
  itemPath = '',
  onGrant,
  onDelete
}) => {
  const hasChildren = (item.attachments && item.attachments.length > 0) || 
                      (item.cargo && item.cargo.length > 0);
  const [isExpanded, setIsExpanded] = useState(depth < 2); // Auto-expand first 2 levels

  const attachmentCount = item.attachments?.length || 0;
  const cargoCount = item.cargo?.length || 0;

  return (
    <div className="border-l-2 border-surface-200" style={{ marginLeft: depth > 0 ? '16px' : 0 }}>
      <div 
        className={`flex items-center gap-2 py-2 px-3 hover:bg-surface-100 transition-colors ${
          depth === 0 ? 'bg-surface-50 rounded-lg border border-surface-200 mb-1' : ''
        }`}
      >
        {/* Expand/Collapse Button */}
        {hasChildren ? (
          <button 
            onClick={() => setIsExpanded(!isExpanded)}
            className="p-0.5 rounded hover:bg-surface-200 transition-colors"
          >
            {isExpanded ? (
              <ChevronDown size={14} className="text-surface-500" />
            ) : (
              <ChevronRight size={14} className="text-surface-500" />
            )}
          </button>
        ) : (
          <span className="w-5" />
        )}

        {/* Item Icon based on type */}
        {depth === 0 ? (
          <Package size={14} className="text-primary-500 flex-shrink-0" />
        ) : item.slotName ? (
          <Paperclip size={14} className="text-orange-500 flex-shrink-0" />
        ) : (
          <Box size={14} className="text-cyan-500 flex-shrink-0" />
        )}

        {/* Item Name */}
        <span className={`font-medium truncate flex-1 ${
          depth === 0 ? 'text-surface-800' : 'text-surface-600'
        }`}>
          {item.className}
        </span>

        {/* Slot info if available */}
        {item.slotName && (
          <span className="text-xs text-orange-600 bg-orange-50 px-1.5 py-0.5 rounded">
            {item.slotName}
          </span>
        )}

        {/* Child counts */}
        {attachmentCount > 0 && (
          <span className="text-xs text-orange-600 bg-orange-50 px-1.5 py-0.5 rounded flex items-center gap-1">
            <Paperclip size={10} />
            {attachmentCount}
          </span>
        )}
        {cargoCount > 0 && (
          <span className="text-xs text-cyan-600 bg-cyan-50 px-1.5 py-0.5 rounded flex items-center gap-1">
            <Box size={10} />
            {cargoCount}
          </span>
        )}

        {/* Quantity - smart display based on item type */}
        {(() => {
          const qtyInfo = getQuantityDisplay(item);
          if (!qtyInfo) return null;
          
          if (qtyInfo.type === 'stack') {
            return (
              <span className="text-xs text-surface-600 bg-surface-200 px-1.5 py-0.5 rounded">
                {qtyInfo.display}
              </span>
            );
          }
          
          if (qtyInfo.type === 'liquid') {
            const percent = qtyInfo.percent || 0;
            return (
              <span className={`text-xs px-1.5 py-0.5 rounded flex items-center gap-1 ${
                percent > 50 ? 'text-blue-600 bg-blue-50' :
                percent > 25 ? 'text-blue-500 bg-blue-50' :
                'text-blue-400 bg-blue-50'
              }`}>
                <Droplets size={10} />
                {qtyInfo.display}
              </span>
            );
          }
          
          if (qtyInfo.type === 'food') {
            const percent = qtyInfo.percent || 0;
            return (
              <span className={`text-xs px-1.5 py-0.5 rounded flex items-center gap-1 ${
                percent > 75 ? 'text-green-600 bg-green-50' :
                percent > 50 ? 'text-lime-600 bg-lime-50' :
                percent > 25 ? 'text-amber-600 bg-amber-50' :
                'text-red-600 bg-red-50'
              }`}>
                <Utensils size={10} />
                {qtyInfo.display}
              </span>
            );
          }
          
          return null;
        })()}

        {/* Health */}
        {item.health !== undefined && item.health < 100 && (
          <span className={`text-xs px-1.5 py-0.5 rounded ${
            item.health > 50 ? 'text-green-600 bg-green-50' :
            item.health > 25 ? 'text-yellow-600 bg-yellow-50' :
            'text-red-600 bg-red-50'
          }`}>
            {Math.round(item.health)}%
          </span>
        )}

        {/* Grant Button */}
        {onGrant && (
          <Button
            variant="ghost"
            size="sm"
            onClick={(e) => {
              e.stopPropagation();
              onGrant(item.className);
            }}
            className="text-xs px-2 py-1"
          >
            Grant
          </Button>
        )}

        {/* Delete Button */}
        {onDelete && (
          <Button
            variant="ghost"
            size="sm"
            onClick={(e) => {
              e.stopPropagation();
              onDelete(item.className, itemPath, item.displayName || item.className);
            }}
            className="text-xs px-2 py-1 text-red-500 hover:text-red-700 hover:bg-red-50"
          >
            <Trash2 size={12} />
          </Button>
        )}
      </div>

      {/* Children */}
      {isExpanded && hasChildren && (
        <div className="pl-2">
          {/* Attachments */}
          {item.attachments && item.attachments.length > 0 && (
            <div className="mt-1">
              {item.attachments.map((att, idx) => (
                <InventoryItemRow 
                  key={`att-${idx}-${att.className}`} 
                  item={att} 
                  depth={depth + 1}
                  itemPath={`${itemPath}.attachments.${idx}`}
                  onGrant={onGrant}
                  onDelete={onDelete}
                />
              ))}
            </div>
          )}
          
          {/* Cargo */}
          {item.cargo && item.cargo.length > 0 && (
            <div className="mt-1">
              {item.cargo.map((cargo, idx) => (
                <InventoryItemRow 
                  key={`cargo-${idx}-${cargo.className}`} 
                  item={cargo} 
                  depth={depth + 1}
                  itemPath={`${itemPath}.cargo.${idx}`}
                  onGrant={onGrant}
                  onDelete={onDelete}
                />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
};

interface InventoryTreeProps {
  items: InventoryItem[];
  onGrant?: (className: string) => void;
  onDelete?: (className: string, itemPath: string, displayName: string) => void;
}

export const InventoryTree: React.FC<InventoryTreeProps> = ({ items, onGrant, onDelete }) => {
  const allItems = flattenInventory(items);
  
  return (
    <div>
      {/* Summary */}
      <div className="flex items-center gap-4 mb-4 text-sm text-surface-500">
        <span className="flex items-center gap-1">
          <Package size={14} />
          {items.length} equipped slots
        </span>
        <span>|</span>
        <span className="flex items-center gap-1">
          <Box size={14} />
          {allItems.length} total items
        </span>
      </div>
      
      {/* Tree View */}
      <div className="space-y-1">
        {items.map((item, idx) => (
          <InventoryItemRow 
            key={`root-${idx}-${item.className}`} 
            item={item} 
            depth={0}
            itemPath={`${idx}`}
            onGrant={onGrant}
            onDelete={onDelete}
          />
        ))}
      </div>
    </div>
  );
};

export default InventoryTree;
