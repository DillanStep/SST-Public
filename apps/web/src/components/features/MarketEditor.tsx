import React, { useState, useEffect, useCallback } from 'react';
import { Store, RefreshCw, Plus, Trash2, Edit2, X, Check, Package } from 'lucide-react';
import { Card, Button, Badge, Input } from '../ui';
import { 
  getMarketCategories, 
  getMarketCategory, 
  updateMarketItem, 
  addMarketItem, 
  deleteMarketItem,
  getInventoryCounts
} from '../../services/api';
import type { MarketCategorySummary, MarketCategory, MarketItem } from '../../types';

// Helper to clean localization strings like "#STR_EXPANSION_MARKET_CATEGORY_AMMO"
function cleanDisplayName(name: string | undefined, fallbackFileName?: string): string {
  if (!name || name.startsWith('#STR_')) {
    if (fallbackFileName) {
      return fallbackFileName
        .replace(/\.json$/i, '')
        .replace(/([A-Z])/g, ' $1')
        .replace(/[-_]/g, ' ')
        .trim();
    }
    if (name) {
      return name
        .replace('#STR_EXPANSION_MARKET_CATEGORY_', '')
        .replace('#STR_EXPANSION_MARKET_TRADER_', '')
        .replace('#STR_EXPANSION_', '')
        .replace('#STR_', '')
        .replace(/_/g, ' ')
        .toLowerCase()
        .replace(/\b\w/g, c => c.toUpperCase());
    }
    return fallbackFileName || 'Unknown';
  }
  return name;
}

interface MarketEditorProps {
  isConnected: boolean;
}

export const MarketEditor: React.FC<MarketEditorProps> = ({ isConnected }) => {
  const [categories, setCategories] = useState<MarketCategorySummary[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  // Inventory counts (how many of each item players own)
  const [inventoryCounts, setInventoryCounts] = useState<Record<string, number>>({});
  const [countsLastUpdated, setCountsLastUpdated] = useState<string | null>(null);
  
  // Selected category
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [categoryData, setCategoryData] = useState<MarketCategory | null>(null);
  const [loadingCategory, setLoadingCategory] = useState(false);
  
  // Search/filter
  const [searchTerm, setSearchTerm] = useState('');
  
  // Edit state
  const [editingItem, setEditingItem] = useState<string | null>(null);
  const [editValues, setEditValues] = useState<Partial<MarketItem>>({});
  const [saving, setSaving] = useState(false);
  
  // Add new item
  const [showAddItem, setShowAddItem] = useState(false);
  const [newItem, setNewItem] = useState<Partial<MarketItem>>({
    ClassName: '',
    MaxPriceThreshold: 1000,
    MinPriceThreshold: 500,
    SellPricePercent: -1,
    MaxStockThreshold: 100,
    MinStockThreshold: 1,
  });

  const loadCategories = useCallback(async () => {
    if (!isConnected) return;
    
    setLoading(true);
    setError(null);
    try {
      // Load categories and inventory counts in parallel
      const [categoriesData, countsData] = await Promise.all([
        getMarketCategories(),
        getInventoryCounts().catch(() => ({ counts: {}, lastUpdated: '' }))
      ]);
      
      setCategories(categoriesData.categories || []);
      setInventoryCounts(countsData.counts || {});
      setCountsLastUpdated(countsData.lastUpdated || null);
    } catch (err) {
      setError('Failed to load market categories');
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, [isConnected]);

  useEffect(() => {
    loadCategories();
  }, [loadCategories]);

  const loadCategory = async (fileName: string) => {
    setLoadingCategory(true);
    try {
      const data = await getMarketCategory(fileName);
      setCategoryData(data);
      setSelectedCategory(fileName);
    } catch (err) {
      console.error('Failed to load category:', err);
    } finally {
      setLoadingCategory(false);
    }
  };

  const handleEditItem = (item: MarketItem) => {
    setEditingItem(item.ClassName);
    setEditValues({
      MaxPriceThreshold: item.MaxPriceThreshold,
      MinPriceThreshold: item.MinPriceThreshold,
      SellPricePercent: item.SellPricePercent,
      MaxStockThreshold: item.MaxStockThreshold,
      MinStockThreshold: item.MinStockThreshold,
    });
  };

  const handleSaveItem = async (className: string) => {
    if (!selectedCategory) return;
    
    setSaving(true);
    try {
      await updateMarketItem(selectedCategory, className, editValues);
      
      // Reload category to get updated data
      await loadCategory(selectedCategory);
      setEditingItem(null);
      setEditValues({});
    } catch (err) {
      console.error('Failed to save item:', err);
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteItem = async (className: string) => {
    if (!selectedCategory || !confirm(`Delete ${className} from this category?`)) return;
    
    try {
      await deleteMarketItem(selectedCategory, className);
      await loadCategory(selectedCategory);
    } catch (err) {
      console.error('Failed to delete item:', err);
    }
  };

  const handleAddItem = async () => {
    if (!selectedCategory || !newItem.ClassName) return;
    
    setSaving(true);
    try {
      await addMarketItem(selectedCategory, newItem);
      await loadCategory(selectedCategory);
      setShowAddItem(false);
      setNewItem({
        ClassName: '',
        MaxPriceThreshold: 1000,
        MinPriceThreshold: 500,
        SellPricePercent: -1,
        MaxStockThreshold: 100,
        MinStockThreshold: 1,
      });
    } catch (err) {
      console.error('Failed to add item:', err);
    } finally {
      setSaving(false);
    }
  };

  // Filter items by search term
  const filteredItems = categoryData?.Items.filter(item =>
    item.ClassName.toLowerCase().includes(searchTerm.toLowerCase())
  ) || [];

  if (!isConnected) {
    return (
      <Card>
        <div className="flex items-center gap-2 mb-4">
          <Store className="text-velvet" size={24} />
          <h2 className="text-xl font-bold text-surface-800">Market Editor</h2>
        </div>
        <p className="text-surface-500">Connect to the API to edit market prices.</p>
      </Card>
    );
  }

  return (
    <Card>
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <Store className="text-velvet" size={24} />
          <h2 className="text-xl font-bold text-surface-800">Market Editor</h2>
        </div>
        <Button
          variant="ghost"
          size="sm"
          onClick={loadCategories}
          disabled={loading}
          icon={<RefreshCw size={16} className={loading ? 'animate-spin' : ''} />}
        >
          Refresh
        </Button>
      </div>

      {error && (
        <div className="mb-4 p-3 bg-red-50 border border-red-200 text-red-700 rounded-md text-sm">
          {error}
        </div>
      )}

      <div className="flex gap-4">
        {/* Categories List */}
        <div className="w-64 flex-shrink-0">
          <h3 className="text-sm font-semibold text-dark-400 mb-2">Categories</h3>
          <div className="space-y-1 max-h-[500px] overflow-y-auto">
            {categories.map(cat => (
              <button
                key={cat.fileName}
                onClick={() => loadCategory(cat.fileName)}
                className={`w-full text-left px-3 py-2 rounded-md text-sm transition-colors ${
                  selectedCategory === cat.fileName
                    ? 'bg-velvet text-white'
                    : 'hover:bg-surface-100 text-dark-400'
                }`}
              >
                <div className="flex items-center justify-between">
                  <span className="truncate">{cleanDisplayName(cat.displayName, cat.fileName)}</span>
                  <Badge variant="default">{cat.itemCount}</Badge>
                </div>
              </button>
            ))}
          </div>
        </div>

        {/* Items Panel */}
        <div className="flex-1 border-l border-surface-200 pl-4">
          {loadingCategory ? (
            <div className="flex items-center justify-center py-12">
              <RefreshCw size={24} className="animate-spin text-surface-500" />
            </div>
          ) : categoryData ? (
            <>
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h3 className="font-semibold text-surface-800">
                    {cleanDisplayName(categoryData.DisplayName, selectedCategory || undefined)}
                  </h3>
                  {countsLastUpdated && (
                    <p className="text-xs text-surface-500 mt-1">
                      Inventory counts as of {new Date(countsLastUpdated).toLocaleTimeString()}
                    </p>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  <Input
                    placeholder="Search items..."
                    value={searchTerm}
                    onChange={e => setSearchTerm(e.target.value)}
                    className="w-48"
                  />
                  <Button
                    size="sm"
                    onClick={() => setShowAddItem(true)}
                    icon={<Plus size={14} />}
                  >
                    Add Item
                  </Button>
                </div>
              </div>

              {/* Add Item Form */}
              {showAddItem && (
                <div className="mb-4 p-4 bg-surface-50 border border-surface-200 rounded-md">
                  <div className="flex items-center justify-between mb-3">
                    <h4 className="font-medium text-dark-400">Add New Item</h4>
                    <button onClick={() => setShowAddItem(false)}>
                      <X size={18} className="text-surface-500" />
                    </button>
                  </div>
                  <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                    <Input
                      placeholder="ClassName"
                      value={newItem.ClassName || ''}
                      onChange={e => setNewItem({ ...newItem, ClassName: e.target.value })}
                    />
                    <Input
                      type="number"
                      placeholder="Min Price"
                      value={newItem.MinPriceThreshold || ''}
                      onChange={e => setNewItem({ ...newItem, MinPriceThreshold: parseInt(e.target.value) })}
                    />
                    <Input
                      type="number"
                      placeholder="Max Price"
                      value={newItem.MaxPriceThreshold || ''}
                      onChange={e => setNewItem({ ...newItem, MaxPriceThreshold: parseInt(e.target.value) })}
                    />
                  </div>
                  <div className="mt-3 flex justify-end">
                    <Button onClick={handleAddItem} disabled={saving || !newItem.ClassName}>
                      {saving ? 'Adding...' : 'Add Item'}
                    </Button>
                  </div>
                </div>
              )}

              {/* Items Table */}
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-surface-200">
                      <th className="text-left py-2 px-2 text-dark-400 font-medium">ClassName</th>
                      <th className="text-right py-2 px-2 text-dark-400 font-medium">Min Price</th>
                      <th className="text-right py-2 px-2 text-dark-400 font-medium">Max Price</th>
                      <th className="text-right py-2 px-2 text-dark-400 font-medium">Min Stock</th>
                      <th className="text-right py-2 px-2 text-dark-400 font-medium">Max Stock</th>
                      <th className="text-right py-2 px-2 text-dark-400 font-medium">Variants</th>
                      <th className="text-right py-2 px-2 text-dark-400 font-medium" title="How many of this item players currently have in their inventories">
                        <div className="flex items-center justify-end gap-1">
                          <Package size={14} />
                          <span>In Inv</span>
                        </div>
                      </th>
                      <th className="text-right py-2 px-2"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredItems.map(item => (
                      <tr key={item.ClassName} className="border-b border-surface-100 hover:bg-surface-50">
                        <td className="py-2 px-2 font-mono text-xs">{item.ClassName}</td>
                        <td className="py-2 px-2 text-right">
                          {editingItem === item.ClassName ? (
                            <Input
                              type="number"
                              value={editValues.MinPriceThreshold || ''}
                              onChange={e => setEditValues({ ...editValues, MinPriceThreshold: parseInt(e.target.value) })}
                              className="w-20 text-right"
                            />
                          ) : (
                            item.MinPriceThreshold
                          )}
                        </td>
                        <td className="py-2 px-2 text-right">
                          {editingItem === item.ClassName ? (
                            <Input
                              type="number"
                              value={editValues.MaxPriceThreshold || ''}
                              onChange={e => setEditValues({ ...editValues, MaxPriceThreshold: parseInt(e.target.value) })}
                              className="w-20 text-right"
                            />
                          ) : (
                            item.MaxPriceThreshold
                          )}
                        </td>
                        <td className="py-2 px-2 text-right">
                          {editingItem === item.ClassName ? (
                            <Input
                              type="number"
                              value={editValues.MinStockThreshold || ''}
                              onChange={e => setEditValues({ ...editValues, MinStockThreshold: parseInt(e.target.value) })}
                              className="w-16 text-right"
                            />
                          ) : (
                            item.MinStockThreshold
                          )}
                        </td>
                        <td className="py-2 px-2 text-right">
                          {editingItem === item.ClassName ? (
                            <Input
                              type="number"
                              value={editValues.MaxStockThreshold || ''}
                              onChange={e => setEditValues({ ...editValues, MaxStockThreshold: parseInt(e.target.value) })}
                              className="w-16 text-right"
                            />
                          ) : (
                            item.MaxStockThreshold
                          )}
                        </td>
                        <td className="py-2 px-2 text-right text-surface-500">
                          {item.Variants?.length || 0}
                        </td>
                        <td className="py-2 px-2 text-right">
                          {(() => {
                            const count = inventoryCounts[item.ClassName.toLowerCase()] || 0;
                            if (count === 0) {
                              return <span className="text-surface-500/50">0</span>;
                            }
                            return (
                              <span title={`${count} currently in player inventories`}>
                                <Badge variant={count > 50 ? 'success' : count > 10 ? 'warning' : 'default'}>
                                  {count}
                                </Badge>
                              </span>
                            );
                          })()}
                        </td>
                        <td className="py-2 px-2 text-right">
                          {editingItem === item.ClassName ? (
                            <div className="flex items-center justify-end gap-1">
                              <button
                                onClick={() => handleSaveItem(item.ClassName)}
                                disabled={saving}
                                className="p-1 text-green-600 hover:bg-green-50 rounded"
                              >
                                <Check size={16} />
                              </button>
                              <button
                                onClick={() => setEditingItem(null)}
                                className="p-1 text-surface-500 hover:bg-surface-100 rounded"
                              >
                                <X size={16} />
                              </button>
                            </div>
                          ) : (
                            <div className="flex items-center justify-end gap-1">
                              <button
                                onClick={() => handleEditItem(item)}
                                className="p-1 text-velvet hover:bg-velvet/10 rounded"
                              >
                                <Edit2 size={14} />
                              </button>
                              <button
                                onClick={() => handleDeleteItem(item.ClassName)}
                                className="p-1 text-red-500 hover:bg-red-50 rounded"
                              >
                                <Trash2 size={14} />
                              </button>
                            </div>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {filteredItems.length === 0 && (
                <div className="text-center py-8 text-surface-500">
                  {searchTerm ? 'No items match your search' : 'No items in this category'}
                </div>
              )}
            </>
          ) : (
            <div className="text-center py-12 text-surface-500">
              <Store size={48} className="mx-auto mb-4 opacity-30" />
              <p>Select a category to view and edit items</p>
            </div>
          )}
        </div>
      </div>
    </Card>
  );
};

export default MarketEditor;
