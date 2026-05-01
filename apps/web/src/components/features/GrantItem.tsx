import React, { useState, useEffect, useCallback } from 'react';
import { Gift, Send, CheckCircle, XCircle, Clock, RefreshCw } from 'lucide-react';
import { Card, Button, Input, Badge } from '../ui';
import { createGrant, getGrantResults } from '../../services/api';
import type { Item, GrantResult } from '../../types';

interface GrantItemProps {
  isConnected: boolean;
  selectedItem?: Item | null;
}

export const GrantItem: React.FC<GrantItemProps> = ({ isConnected, selectedItem }) => {
  const [playerId, setPlayerId] = useState('');
  const [itemClassName, setItemClassName] = useState('');
  const [quantity, setQuantity] = useState(1);
  const [health, setHealth] = useState(100);
  const [sending, setSending] = useState(false);
  const [result, setResult] = useState<{ success: boolean; message: string } | null>(null);
  const [grantResults, setGrantResults] = useState<GrantResult[]>([]);
  const [loadingResults, setLoadingResults] = useState(false);

  // Update item when selected from search
  useEffect(() => {
    if (selectedItem) {
      setItemClassName(selectedItem.className);
    }
  }, [selectedItem]);

  const loadGrantResults = useCallback(async () => {
    if (!isConnected) return;
    
    setLoadingResults(true);
    try {
      const data = await getGrantResults();
      setGrantResults(data.results || []);
    } catch (err) {
      console.error('Failed to load grant results:', err);
    } finally {
      setLoadingResults(false);
    }
  }, [isConnected]);

  useEffect(() => {
    if (isConnected) {
      loadGrantResults();
    }
  }, [isConnected, loadGrantResults]);

  const handleGrant = async () => {
    if (!playerId || !itemClassName) {
      setResult({ success: false, message: 'Please enter Player ID and Item Class Name' });
      return;
    }

    setSending(true);
    setResult(null);

    try {
      const response = await createGrant({
        playerId,
        itemClassName,
        quantity,
        health,
      });

      setResult({
        success: true,
        message: `${response.status} - ${itemClassName} x${quantity} queued for ${playerId}`,
      });

      // Refresh grant results after a short delay
      setTimeout(loadGrantResults, 1000);
    } catch (err) {
      setResult({
        success: false,
        message: err instanceof Error ? err.message : 'Failed to create grant',
      });
    } finally {
      setSending(false);
    }
  };

  const getResultBadge = (result: string) => {
    switch (result) {
      case 'SUCCESS':
        return <Badge variant="success"><CheckCircle size={12} className="mr-1" /> Success</Badge>;
      case 'FAILED':
        return <Badge variant="error"><XCircle size={12} className="mr-1" /> Failed</Badge>;
      default:
        return <Badge variant="warning"><Clock size={12} className="mr-1" /> Pending</Badge>;
    }
  };

  if (!isConnected) {
    return (
      <Card compact title="Grant Item" icon={<Gift size={20} />}>
        <p className="text-surface-500">Connect to the API to grant items.</p>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <Card compact title="Grant Item" icon={<Gift size={20} />}>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4 mb-4">
          <Input
            label="Player Steam64 ID"
            placeholder="76561199516143070"
            value={playerId}
            onChange={(e) => setPlayerId(e.target.value)}
          />
          <Input
            label="Item Class Name"
            placeholder="M4A1"
            value={itemClassName}
            onChange={(e) => setItemClassName(e.target.value)}
          />
          <Input
            label="Quantity"
            type="number"
            min={1}
            max={100}
            value={quantity}
            onChange={(e) => setQuantity(parseInt(e.target.value) || 1)}
          />
          <Input
            label="Health %"
            type="number"
            min={0}
            max={100}
            value={health}
            onChange={(e) => setHealth(parseInt(e.target.value) || 100)}
          />
        </div>

        <div className="flex items-center gap-4">
          <Button
            onClick={handleGrant}
            loading={sending}
            icon={<Send size={16} />}
          >
            Send Grant
          </Button>

          {result && (
            <div className={`flex items-center gap-2 ${result.success ? 'text-green-600' : 'text-red-600'}`}>
              {result.success ? <CheckCircle size={18} /> : <XCircle size={18} />}
              <span>{result.message}</span>
            </div>
          )}
        </div>

        {selectedItem && (
          <div className="mt-4 p-3 bg-surface-50 rounded-lg border border-surface-300">
            <p className="text-sm text-surface-600">
              Selected: <span className="text-surface-800 font-medium">{selectedItem.displayName}</span>
              <span className="text-surface-500 ml-2">({selectedItem.className})</span>
            </p>
          </div>
        )}
      </Card>

      {/* Grant Results */}
      <Card 
        title="Grant Results" 
        icon={<CheckCircle size={20} />}
        actions={
          <Button
            variant="ghost"
            size="sm"
            onClick={loadGrantResults}
            loading={loadingResults}
            icon={<RefreshCw size={14} />}
          >
            Refresh
          </Button>
        }
      >
        {grantResults.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-surface-300">
                  <th className="py-3 px-4 text-left text-sm font-semibold text-surface-600">Player ID</th>
                  <th className="py-3 px-4 text-left text-sm font-semibold text-surface-600">Item</th>
                  <th className="py-3 px-4 text-left text-sm font-semibold text-surface-600">Qty</th>
                  <th className="py-3 px-4 text-left text-sm font-semibold text-surface-600">Health</th>
                  <th className="py-3 px-4 text-left text-sm font-semibold text-surface-600">Status</th>
                </tr>
              </thead>
              <tbody>
                {grantResults.slice(0, 20).map((grant, idx) => (
                  <tr key={idx} className="border-b border-surface-200">
                    <td className="py-3 px-4">
                      <code className="text-primary-500 bg-surface-100 px-2 py-1 rounded text-xs">
                        {grant.playerId}
                      </code>
                    </td>
                    <td className="py-3 px-4 text-surface-800">{grant.itemClassName}</td>
                    <td className="py-3 px-4 text-surface-600">{grant.quantity}</td>
                    <td className="py-3 px-4 text-surface-600">{grant.health}%</td>
                    <td className="py-3 px-4">{getResultBadge(grant.result)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="text-surface-500 text-center py-8">No grant results yet</p>
        )}
      </Card>
    </div>
  );
};

export default GrantItem;
