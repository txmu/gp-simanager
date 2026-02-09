import React, { useState } from 'react';
import { X, Calculator, Coins, ArrowRight, Wallet } from 'lucide-react';
import { Subscription, CurrencySettings } from '../types';
import { convertCurrency } from '../utils/helpers';

// 内部辅助函数：用于在计算循环中推进日期
const getNextCycleDate = (current: Date, days: number, type: string = 'daily'): Date => {
  const next = new Date(current);
  if (type === 'monthly') {
    next.setMonth(next.getMonth() + 1);
  } else if (type === 'annual') {
    next.setFullYear(next.getFullYear() + 1);
  } else {
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
      if (sub.isArchived || sub.cycleType === 'permanent') return;

      const cycleDays = sub.cycleDays || 30;
      const cycleType = sub.cycleType || 'daily';
      
      // --- 余额预处理逻辑 ---
      // 将当前余额换算为套餐使用的币种，以便进行模拟扣费
      let virtualBalance = sub.balance || 0;
      if (sub.balance && sub.balanceCurrency && sub.balanceCurrency !== sub.currency) {
        virtualBalance = convertCurrency(
          sub.balance,
          sub.balanceCurrency,
          sub.currency,
          currencySettings.rates
        );
      }

      let currentRenewal = new Date(sub.lastActiveDate || sub.startDate);
      currentRenewal.setHours(0, 0, 0, 0);

      // 1. 快速前进：跳过统计窗口之前的日期，并扣除历史发生的余额消耗
      let catchUpLimit = 0;
      const now = new Date();
      now.setHours(0,0,0,0);

      while (currentRenewal < start && catchUpLimit < 500) {
        // 如果这个续费点发生在“记录余额的那一刻”和“统计开始日”之间
        // 理论上也会消耗余额，但由于 sub.balance 通常反映的是“当前”余额，
        // 我们假设用户填写的 balance 就是统计开始时的可用余额。
        currentRenewal = getNextCycleDate(currentRenewal, cycleDays, cycleType);
        catchUpLimit++;
      }

      // 2. 统计窗口内模拟扣费
      let iterationLimit = 0;
      while (currentRenewal <= end && iterationLimit < 500) {
        if (currentRenewal >= start) {
          const price = sub.cost || 0;
          let realOutPocket = 0;

          // 余额抵扣逻辑
          if (virtualBalance >= price) {
            // 余额充足，全额抵扣
            virtualBalance -= price;
            realOutPocket = 0;
          } else {
            // 余额不足，计算需要额外支付的差额
            realOutPocket = price - virtualBalance;
            virtualBalance = 0; // 余额耗尽
          }

          if (realOutPocket > 0) {
            if (useBaseCurrency) {
              const converted = convertCurrency(
                realOutPocket,
                sub.currency,
                currencySettings.baseCurrency,
                currencySettings.rates
              );
              const key = `${currencySettings.baseCurrency} (额外支出)`;
              totals[key] = (totals[key] || 0) + converted;
            } else {
              const key = sub.currency;
              totals[key] = (totals[key] || 0) + realOutPocket;
            }
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
            现金流开支审计
          </h2>
          <button onClick={onClose} className="text-gray-400 hover:text-red-500 transition-colors">
            <X className="w-6 h-6" />
          </button>
        </div>
        
        <div className="p-5 space-y-4">
          <div className="bg-amber-50 p-3 rounded-lg border border-amber-100 mb-2">
            <p className="text-[10px] text-amber-800 leading-relaxed flex gap-2">
              <Wallet className="w-3 h-3 shrink-0 mt-0.5" />
              <span>
                <b>审计模式说明：</b> 计算结果已自动扣除套餐内 <b>已有余额</b>。
                仅显示您在选定时间段内需要 <b>额外充值</b> 的金额。
              </span>
            </p>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-[10px] font-bold text-gray-400 uppercase mb-1">开始日期</label>
              <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} className="w-full px-3 py-2 border rounded-lg text-sm" />
            </div>
            <div>
              <label className="block text-[10px] font-bold text-gray-400 uppercase mb-1">结束日期</label>
              <input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} className="w-full px-3 py-2 border rounded-lg text-sm" />
            </div>
          </div>

          <label className="flex items-center justify-between p-3 bg-indigo-50/50 border border-indigo-100 rounded-xl cursor-pointer">
            <div className="flex items-center gap-2">
              <Coins className="w-4 h-4 text-indigo-600" />
              <span className="text-xs font-bold text-indigo-900">统一汇率折算</span>
            </div>
            <input type="checkbox" checked={useBaseCurrency} onChange={(e) => setUseBaseCurrency(e.target.checked)} className="w-4 h-4 text-indigo-600 rounded" />
          </label>

          <button onClick={calculate} className="w-full bg-indigo-600 text-white py-3 rounded-xl font-bold hover:bg-indigo-700 shadow-lg flex items-center justify-center gap-2">
            计算实际需充值金额
            <ArrowRight className="w-4 h-4" />
          </button>

          {results && (
            <div className="mt-4 pt-4 border-t border-gray-100 animate-fade-in">
              <h3 className="text-xs font-black text-gray-400 uppercase mb-3">审计结果 (需额外投入)</h3>
              {Object.keys(results).length === 0 ? (
                <div className="text-center py-6 bg-emerald-50 rounded-lg border border-dashed border-emerald-200">
                   <p className="text-xs text-emerald-700 font-bold">余额充足，无需额外充值！</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {Object.entries(results).map(([curr, total]) => (
                    <div key={curr} className="flex justify-between items-center bg-gray-50 p-3 rounded-xl border border-gray-200">
                      <span className="font-bold text-gray-700 text-xs">{curr}</span>
                      <span className="font-mono text-indigo-600 font-black text-lg">
                        {(total as number).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                      </span>
                    </div>
                  ))}
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