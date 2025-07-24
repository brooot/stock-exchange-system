'use client';

import React from 'react';

interface AccountInfo {
  balance: string;
}

interface AccountInfoProps {
  accountInfo: AccountInfo | null;
  portfolioValue: number;
}

export default function AccountInfo({ accountInfo, portfolioValue }: AccountInfoProps) {
  return (
    <div className="bg-white rounded-lg shadow p-6">
      <h2 className="text-lg font-medium text-gray-900 mb-4">账户信息</h2>
      {accountInfo ? (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="space-y-4">
            <div className="flex justify-between">
              <span className="text-gray-600">现金余额:</span>
              <span className="font-medium text-green-600">
                ${accountInfo.balance}
              </span>
            </div>
          </div>
          <div>
            <div className="flex justify-between">
              <span className="text-gray-600">投资组合价值:</span>
              <span className="font-medium text-blue-600">
                ${portfolioValue}
              </span>
            </div>
          </div>
          <div>
            <div className="flex justify-between">
              <span className="text-gray-600">总资产:</span>
              <span className="font-medium text-purple-600">
                ${(parseFloat(accountInfo.balance) + portfolioValue).toFixed(2)}
              </span>
            </div>
          </div>
        </div>
      ) : (
        <div className="animate-pulse">
          <div className="h-4 bg-gray-200 rounded mb-2"></div>
          <div className="h-4 bg-gray-200 rounded mb-2"></div>
          <div className="h-4 bg-gray-200 rounded"></div>
        </div>
      )}
    </div>
  );
}