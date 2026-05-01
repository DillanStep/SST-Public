import React, { useState, useEffect, useCallback } from 'react';
import { Search, Package, Filter } from 'lucide-react';
import { Card, Input, Select, Badge } from '../ui';
import { searchItems, getCategories } from '../../services/api';
import type { Item, CategoriesResponse } from '../../types';

interface ItemSearchProps {
  isConnected: boolean;
  onSelectItem?: (item: Item) => void;
}

export const ItemSearch: React.FC<ItemSearchProps> = ({ isConnected, onSelectItem }) => {
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState('');
  const [categories, setCategories] = useState<string[]>([]);
  const [items, setItems] = useState<Item[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Load categories
  useEffect(() => {
    if (!isConnected) return;

    const loadCategories = async () => {
      try {
        const data: CategoriesResponse = await getCategories();
        setCategories(data.categories);
      } catch (err) {
        console.error('Failed to load categories:', err);
      }
    };

    loadCategories();
  }, [isConnected]);

  // Search items with debounce
  const performSearch = useCallback(async () => {
    if (!isConnected) return;
    if (!query && !category) {
      setItems([]);
      setTotalCount(0);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const data = await searchItems({
        q: query || undefined,
        category: category || undefined,
        limit: 50,
      });
      setItems(data.items);
      setTotalCount(data.count);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Search failed');
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, [isConnected, query, category]);

  // Debounced search
  useEffect(() => {
    const timer = setTimeout(() => {
      performSearch();
    }, 300);

    return () => clearTimeout(timer);
  }, [performSearch]);

  const categoryOptions = [
    { value: '', label: 'All Categories' },
    ...categories.map((cat) => ({ value: cat, label: cat })),
  ];

  if (!isConnected) {
    return (
      <Card compact title="Item Search" icon={<Search size={20} />}>
        <p className="text-surface-500">Connect to the API to search items.</p>
      </Card>
    );
  }

  return (
    <Card compact title="Item Search" icon={<Search size={20} />}>
      <div className="flex flex-col sm:flex-row gap-3 sm:gap-4 mb-4">
        <div className="flex-1">
          <Input
            placeholder="Search items by name or class..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            icon={<Search size={16} />}
          />
        </div>
        <div className="w-full sm:w-48">
          <Select
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            options={categoryOptions}
          />
        </div>
      </div>

      {error && (
        <div className="mb-3 p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">
          {error}
        </div>
      )}

      {loading ? (
        <div className="flex items-center justify-center py-6">
          <div className="animate-spin h-8 w-8 border-4 border-primary-500 border-t-transparent rounded-full" />
        </div>
      ) : items.length > 0 ? (
        <>
          <div className="flex items-center gap-2 mb-4 text-sm text-surface-600">
            <Filter size={14} />
            <span>Found {totalCount} items</span>
            {totalCount > 50 && <span>(showing first 50)</span>}
          </div>

          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-surface-300">
                  <th className="py-3 px-4 text-left text-sm font-semibold text-surface-600">Class Name</th>
                  <th className="py-3 px-4 text-left text-sm font-semibold text-surface-600">Display Name</th>
                  <th className="py-3 px-4 text-left text-sm font-semibold text-surface-600">Category</th>
                  {onSelectItem && (
                    <th className="py-3 px-4 text-right text-sm font-semibold text-surface-600">Action</th>
                  )}
                </tr>
              </thead>
              <tbody>
                {items.map((item) => (
                  <tr
                    key={item.className}
                    className={`border-b border-surface-200 hover:bg-surface-50 transition-colors ${
                      onSelectItem ? 'cursor-pointer' : ''
                    }`}
                    onClick={() => onSelectItem?.(item)}
                  >
                    <td className="py-3 px-4">
                      <code className="text-primary-500 bg-surface-100 px-2 py-1 rounded text-sm">
                        {item.className}
                      </code>
                    </td>
                    <td className="py-3 px-4 text-surface-800">{item.displayName}</td>
                    <td className="py-3 px-4">
                      <Badge variant="info">{item.category}</Badge>
                    </td>
                    {onSelectItem && (
                      <td className="py-3 px-4 text-right">
                        <button className="text-primary-500 hover:text-primary-600 text-sm font-medium">
                          Select
                        </button>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      ) : (query || category) ? (
        <div className="flex flex-col items-center justify-center py-12 text-surface-500">
          <Package size={48} className="mb-4 opacity-50" />
          <p>No items found</p>
          <p className="text-sm mt-1">Try a different search term or category</p>
        </div>
      ) : (
        <div className="flex flex-col items-center justify-center py-12 text-surface-500">
          <Search size={48} className="mb-4 opacity-50" />
          <p>Search for items</p>
          <p className="text-sm mt-1">Enter a search term or select a category</p>
        </div>
      )}
    </Card>
  );
};

export default ItemSearch;
