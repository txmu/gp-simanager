import React, { useState } from 'react';
import { X, Calculator, Coins, ArrowRight } from 'lucide-react';
import { Subscription, CurrencySettings } from '../types';
import { calculateNextRenewal, convertCurrency } from '../utils/helpers';

// 内部辅助函数：用于在计算循环中推进日期
// 与 helpers.ts 中的逻辑保持严格一致
const getNextCycleDate = (current: Date, days: number, type: string = 'daily'): Date => {
  const next = new Date(current);
  if (type === 'monthly') {
    next.setMonth(next.getMonth() + 1);
  } else if (type === 'annual') {
    next.setFullYear(next.getFullYear() + 1);
  } else {
    // 涵盖 daily 和 activity_based 逻辑
    next.setDate(next.getDate() + (days || 30));
  }
  return next;
};

interface CostCalculatorProps {
  subscriptions: Subscription[];
  currencySettings: CurrencySettings;
  onClose: () => void;
}

const CostCalculator: React.FC<CostCalculatorProps> = ({ subscriptions, currencySettings, onClose }) => {
  const [startDate, setStartDate] = useState(new Date().toISOString().slice(0, 10));
  const [endDate, setEndDate] = useState(
    new Date(new Date().setFullYear(new Date().getFullYear() + 1)).toISOString().slice(0, 10)
  );
  const [useBaseCurrency, setUseBaseCurrency] = useState(true);
  const [results, setResults] = useState<Record<string, number> | null>(null);

  const calculate = () => {
    const start = new Date(startDate);
    const end = new Date(endDate);
    start.setHours(0, 0, 0, 0);
    end.setHours(23, 59, 59, 999);

    const totals: Record<string, number> = {};

    subscriptions.forEach(sub => {
      // 排除已归档和永久套餐（永久套餐不产生后续续费支出）
      if (sub.isArchived || sub.cycleType === 'permanent') return;

      const cycleDays = sub.cycleDays || 30;
      const cycleType = sub.cycleType || 'daily';
      
      // 起点：如果设置了最后活跃日期且是活跃延期模式，从活跃日算起；否则从开通日算起
      let currentRenewal = new Date(sub.lastActiveDate || sub.startDate);
      currentRenewal.setHours(0, 0, 0, 0);

      // 1. 快速前进：跳过统计窗口之前的日期
      // 这样可以处理那些已经开通很久但还没到统计周期的卡
      let catchUpLimit = 0;
      while (currentRenewal < start && catchUpLimit < 500) {
        currentRenewal = getNextCycleDate(currentRenewal, cycleDays, cycleType);
        catchUpLimit++;
      }

      // 2. 统计窗口内迭代：计算在 [start, end] 范围内的所有续费点
      let iterationLimit = 0;
      while (currentRenewal <= end && iterationLimit < 500) {
        if (currentRenewal >= start) {
          const cost = sub.cost || 0;
          
          if (useBaseCurrency) {
            // 转换为基准货币
            const converted = convertCurrency(
              cost,
              sub.currency,
              currencySettings.baseCurrency,
              currencySettings.rates
            );
            const key = `${currencySettings.baseCurrency} (总计)`;
            totals[key] = (totals[key] || 0) + converted;
          } else {
            // 保持原始货币分类累加
            const key = sub.currency || 'CNY';
            totals[key] = (totals[key] || 0) + cost;
          }
        }
        
        currentRenewal = getNextCycleDate(currentRenewal, cycleDays, cycleType);
        iterationLimit++;
      }
    });

    setResults(totals);
  };

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-sm overflow-hidden animate-fade-in">
        <div className="flex justify-between items-center p-4 border-b border-gray-100 bg-gray-50/50">
          <h2 className="text-lg font-bold text-gray-800 flex items-center gap-2">
            <Calculator className="w-5 h-5 text-indigo-600" />
            费用开支预测
          </h2>
          <button 
            onClick={onClose} 
            className="text-gray-400 hover:text-red-500 transition-colors"
          >
            <X className="w-6 h-6" />
          </button>
        </div>
        
        <div className="p-5 space-y-4">
          <div className="grid grid-cols-1 gap-3">
            <div>
              <label className="block text-[10px] font-bold text-gray-400 uppercase mb-1">开始日期</label>
              <input 
                type="date" 
                value={startDate} 
                onChange={(e) => setStartDate(e.target.value)} 
                className="w-full px-3 py-2 border rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 outline-none" 
              />
            </div>
            <div>
              <label className="block text-[10px] font-bold text-gray-400 uppercase mb-1">结束日期</label>
              <input 
                type="date" 
                value={endDate} 
                onChange={(e) => setEndDate(e.target.value)} 
                className="w-full px-3 py-2 border rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 outline-none" 
              />
            </div>
          </div>

          <label className="flex items-center justify-between p-3 bg-indigo-50/50 border border-indigo-100 rounded-xl cursor-pointer hover:bg-indigo-50 transition-colors group">
            <div className="flex items-center gap-2">
              <Coins className="w-4 h-4 text-indigo-600" />
              <span className="text-xs font-bold text-indigo-900">统一汇率折算</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-[10px] text-indigo-400 font-mono">TO {currencySettings.baseCurrency}</span>
              <input 
                type="checkbox" 
                checked={useBaseCurrency} 
                onChange={(e) => setUseBaseCurrency(e.target.checked)}
                className="w-4 h-4 text-indigo-600 rounded focus:ring-0"
              />
            </div>
          </label>

          <button 
            onClick={calculate} 
            className="w-full bg-indigo-600 text-white py-3 rounded-xl font-bold hover:bg-indigo-700 transition-all active:scale-95 shadow-lg shadow-indigo-200 flex items-center justify-center gap-2"
          >
            开始审计计算
            <ArrowRight className="w-4 h-4" />
          </button>

          {results && (
            <div className="mt-4 pt-4 border-t border-gray-100 animate-fade-in">
              <h3 className="text-xs font-black text-gray-400 uppercase tracking-widest mb-3">计算结果 (Result)</h3>
              {Object.keys(results).length === 0 ? (
                <div className="text-center py-6 bg-gray-50 rounded-lg border border-dashed border-gray-200">
                   <p className="text-xs text-gray-400">该时间段内无任何到期续费项目</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {Object.entries(results).map(([curr, total]) => (
                    <div key={curr} className="flex justify-between items-center bg-gray-50 p-3 rounded-xl border border-gray-200">
                      <span className="font-bold text-gray-700 text-xs">{curr}</span>
                      <div className="text-right">
                        <span className="font-mono text-indigo-600 font-black text-lg">
                          {(total as number).toLocaleString(undefined, {
                            minimumFractionDigits: 2,
                            maximumFractionDigits: 2
                          })}
                        </span>
                      </div>
                    </div>
                  ))}
                  <p className="text-[9px] text-gray-400 text-center mt-2 italic">
                    * 基于当前快照数据及汇率表计算，不含临时超支费用。
                  </p>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default CostCalculator;