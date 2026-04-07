import React, { useState, useMemo } from 'react';
import { useTranslation } from '../hooks/useTranslation';
import { useAppStore } from '../store';
import { motion } from 'framer-motion';
import { PackagePlus, ArrowRightLeft, AlertCircle, Edit2, Eye, Trash2, Send, DollarSign } from 'lucide-react';
import { format } from 'date-fns';
import { v4 as uuidv4 } from 'uuid';
import Modal from '../components/Modal';
import SearchableSelect from '../components/SearchableSelect';
import { InventoryTransaction, ShipmentTransfer } from '../types';
import { canWrite, isSalesperson } from '../lib/permissions';
import { formatCurrency, generateId } from '../lib/utils';
import { useSortableData } from '../hooks/useSortableData';
import { SortIcon } from '../components/SortIcon';

export default function Inventory() {
  const { t, lang } = useTranslation();
  const { state, updateState, activeShipmentId } = useAppStore();
  const currentUser = state.currentUser;
  const isSpRole = isSalesperson(currentUser, state.roles);
  const hasWriteAccess = canWrite(currentUser, state.roles, 'inventory');

  // For salesperson role, only show cars linked to their customers
  const visibleCars = isSpRole && currentUser?.salespersonId
    ? (() => {
        const spCarIds = new Set(state.customers.filter(c => c.salespersonId === currentUser.salespersonId).map(c => c.carId));
        return state.cars.filter(c => spCarIds.has(c.id));
      })()
    : state.cars;
  const [showReceiveModal, setShowReceiveModal] = useState(false);
  const [showTransferModal, setShowTransferModal] = useState(false);
  const [showCarTransferModal, setShowCarTransferModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState<InventoryTransaction | null>(null);
  const [showViewModal, setShowViewModal] = useState<InventoryTransaction | null>(null);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState<InventoryTransaction | null>(null);
  const [selectedStockRowId, setSelectedStockRowId] = useState<string | null>(null);
  const [selectedLogRowId, setSelectedLogRowId] = useState<string | null>(null);

  // Receive Stock State
  const [receiveDate, setReceiveDate] = useState(new Date().toISOString().split('T')[0]);
  const [receiveItems, setReceiveItems] = useState<{ productId: string; qty: number }[]>([{ productId: '', qty: 0 }]);

  // Transfer Stock State
  const [transferDate, setTransferDate] = useState(new Date().toISOString().split('T')[0]);
  const [transferFrom, setTransferFrom] = useState('warehouse');
  const [transferTo, setTransferTo] = useState('');
  const [transferItems, setTransferItems] = useState<{ productId: string; qty: number }[]>([{ productId: '', qty: 0 }]);

  // Car Transfer State
  const [carTransferDate, setCarTransferDate] = useState(new Date().toISOString().split('T')[0]);
  const [carTransferFrom, setCarTransferFrom] = useState('');
  const [carTransferTo, setCarTransferTo] = useState('');
  const [carTransferItems, setCarTransferItems] = useState<{ productId: string; qty: number }[]>([{ productId: '', qty: 0 }]);
  const [carTransferNotes, setCarTransferNotes] = useState('');
  const [carTransferError, setCarTransferError] = useState('');

  // Shipment Transfer State
  const [showShipmentTransferModal, setShowShipmentTransferModal] = useState(false);
  const [shipmentTransferDate, setShipmentTransferDate] = useState(new Date().toISOString().split('T')[0]);
  const [targetShipmentId, setTargetShipmentId] = useState('');
  const [shipmentTransferItems, setShipmentTransferItems] = useState<{ productId: string; qty: number }[]>([]);
  const [shipmentTransferTotalAmount, setShipmentTransferTotalAmount] = useState<number | ''>('');
  const [shipmentTransferBankAccountId, setShipmentTransferBankAccountId] = useState('');
  const [shipmentTransferNotes, setShipmentTransferNotes] = useState('');

  // Shipment Payment State (standalone balance transfer between shipments)
  const [showShipmentPaymentModal, setShowShipmentPaymentModal] = useState(false);
  const [shipmentPaymentDate, setShipmentPaymentDate] = useState(new Date().toISOString().split('T')[0]);
  const [shipmentPaymentTargetId, setShipmentPaymentTargetId] = useState('');
  const [shipmentPaymentAmount, setShipmentPaymentAmount] = useState<number | ''>('');
  const [shipmentPaymentBankAccountId, setShipmentPaymentBankAccountId] = useState('');
  const [shipmentPaymentNotes, setShipmentPaymentNotes] = useState('');

  // Pre-populate remaining products when opening shipment transfer modal
  const openShipmentTransferModal = () => {
    const items = inventoryData
      .filter(row => row.warehouseRemaining > 0)
      .map(row => ({ productId: row.product.id, qty: row.warehouseRemaining }));
    setShipmentTransferItems(items.length > 0 ? items : [{ productId: '', qty: 0 }]);
    setShipmentTransferTotalAmount('');
    setShipmentTransferBankAccountId('');
    setTargetShipmentId('');
    setShipmentTransferNotes('');
    setShipmentTransferDate(new Date().toISOString().split('T')[0]);
    setShowShipmentTransferModal(true);
  };

  // ... (rest of the calculation logic)
  const inventoryData = useMemo(() => state.products.map(product => {
    const transactions = state.inventoryTransactions.filter(
      t => t.productId === product.id && t.shipmentId === activeShipmentId
    );

    // Received into warehouse
    const received = transactions
      .filter(t => t.type === 'receive' && t.toLocation === 'warehouse')
      .reduce((sum, t) => sum + t.qty, 0);

    // Transferred from warehouse to cars
    const loadedToCars = state.cars.map(car => {
      const loaded = transactions
        .filter(t => t.type === 'load' && t.fromLocation === 'warehouse' && t.toLocation === car.id)
        .reduce((sum, t) => sum + t.qty, 0);

      const transferredIn = transactions
        .filter(t => t.type === 'transfer' && t.toLocation === car.id)
        .reduce((sum, t) => sum + t.qty, 0);

      const transferredOut = transactions
        .filter(t => t.type === 'transfer' && t.fromLocation === car.id)
        .reduce((sum, t) => sum + t.qty, 0);

      const returned = transactions
        .filter(t => t.type === 'return' && t.fromLocation === car.id && t.toLocation === 'warehouse')
        .reduce((sum, t) => sum + t.qty, 0);

      const sold = transactions
        .filter(t => t.type === 'sell' && t.fromLocation === car.id)
        .reduce((sum, t) => sum + t.qty, 0);

      return {
        carId: car.id,
        loaded: loaded + transferredIn - transferredOut - returned,
        sold,
        remaining: loaded + transferredIn - transferredOut - returned - sold
      };
    });

    const totalLoaded = loadedToCars.reduce((sum, c) => sum + c.loaded, 0);
    const totalReturned = transactions
      .filter(t => t.type === 'return' && t.toLocation === 'warehouse')
      .reduce((sum, t) => sum + t.qty, 0);

    const warehouseRemaining = received - totalLoaded + totalReturned;

    // Subtract products transferred OUT to another shipment
    const transferredOutToShipment = transactions
      .filter(t => t.type === 'shipment_transfer' && t.fromLocation === 'warehouse')
      .reduce((sum, t) => sum + t.qty, 0);

    const adjustedWarehouseRemaining = warehouseRemaining - transferredOutToShipment;

    const hasNegative = adjustedWarehouseRemaining < 0 || loadedToCars.some(c => c.remaining < 0);

    return {
      product,
      productName: product.name,
      received,
      warehouseRemaining: adjustedWarehouseRemaining,
      cars: loadedToCars,
      hasNegative
    };
  }), [state.products, state.inventoryTransactions, state.cars, activeShipmentId]);

  const { items: sortedInventory, requestSort, sortConfig } = useSortableData(inventoryData, { key: 'productName', direction: 'asc' });

  const handleReceiveStock = (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeShipmentId) return;

    const newTransactions = receiveItems.filter(item => item.productId && item.qty > 0).map((item, idx) => ({
      id: generateId('IT', state.inventoryTransactions, idx),
      date: receiveDate,
      shipmentId: activeShipmentId,
      productId: item.productId,
      type: 'receive' as const,
      fromLocation: 'supplier',
      toLocation: 'warehouse',
      qty: item.qty,
    }));

    updateState({
      inventoryTransactions: [...state.inventoryTransactions, ...newTransactions]
    });
    setShowReceiveModal(false);
    setReceiveItems([{ productId: '', qty: 0 }]);
  };

  const handleTransferStock = (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeShipmentId || !transferFrom || !transferTo) return;

    const type = transferFrom === 'warehouse' ? 'load' : transferTo === 'warehouse' ? 'return' : 'transfer';

    const newTransactions = transferItems.filter(item => item.productId && item.qty > 0).map((item, idx) => ({
      id: generateId('IT', state.inventoryTransactions, idx),
      date: transferDate,
      shipmentId: activeShipmentId,
      productId: item.productId,
      type: type as any,
      fromLocation: transferFrom,
      toLocation: transferTo,
      qty: item.qty,
    }));

    updateState({
      inventoryTransactions: [...state.inventoryTransactions, ...newTransactions]
    });
    setShowTransferModal(false);
    setTransferItems([{ productId: '', qty: 0 }]);
  };

  // Edit State
  const [editDate, setEditDate] = useState('');
  const [editProductId, setEditProductId] = useState('');
  const [editQty, setEditQty] = useState<number | ''>('');
  const [editFrom, setEditFrom] = useState('');
  const [editTo, setEditTo] = useState('');

  const openEditModal = (log: InventoryTransaction) => {
    setEditDate(log.date);
    setEditProductId(log.productId);
    setEditQty(log.qty);
    setEditFrom(log.fromLocation);
    setEditTo(log.toLocation);
    setShowEditModal(log);
  };

  const handleUpdateTransaction = (e: React.FormEvent) => {
    e.preventDefault();
    if (!showEditModal || !editProductId || !editQty) return;

    const updatedTransaction: InventoryTransaction = {
      ...showEditModal,
      date: editDate,
      productId: editProductId,
      qty: Number(editQty),
      fromLocation: editFrom,
      toLocation: editTo,
    };

    updateState({
      inventoryTransactions: state.inventoryTransactions.map(t =>
        t.id === showEditModal.id ? updatedTransaction : t
      )
    });

    setShowEditModal(null);
  };

  const handleDeleteTransaction = () => {
    if (!showDeleteConfirm) return;
    updateState({
      inventoryTransactions: state.inventoryTransactions.filter(t => t.id !== showDeleteConfirm.id)
    });
    setShowDeleteConfirm(null);
  };

  const handleCarTransfer = (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeShipmentId || !carTransferFrom || !carTransferTo) return;

    const validItems = carTransferItems.filter(item => item.productId && item.qty > 0);
    if (validItems.length === 0) return;

    for (const item of validItems) {
      const productData = inventoryData.find(p => p.product.id === item.productId);
      const carData = productData?.cars.find(c => c.carId === carTransferFrom);

      if (!carData || carData.remaining < item.qty) {
        setCarTransferError(`${t('insufficientStock')}: ${productData?.product.name}`);
        return;
      }
    }

    const transferId = generateId('ST', state.shipmentTransfers || []);

    const newTransactions = validItems.map((item, idx) => ({
      id: generateId('IT', state.inventoryTransactions, idx),
      date: carTransferDate,
      shipmentId: activeShipmentId,
      productId: item.productId,
      type: 'transfer' as const,
      fromLocation: carTransferFrom,
      toLocation: carTransferTo,
      qty: item.qty,
      referenceId: transferId,
      notes: carTransferNotes
    }));

    updateState({
      inventoryTransactions: [...state.inventoryTransactions, ...newTransactions]
    });

    setShowCarTransferModal(false);
    setCarTransferItems([{ productId: '', qty: 0 }]);
    setCarTransferNotes('');
    setCarTransferFrom('');
    setCarTransferTo('');
  };

  const handleShipmentTransfer = (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeShipmentId || !targetShipmentId) return;

    const validItems = shipmentTransferItems.filter(item => item.productId && item.qty > 0);
    if (validItems.length === 0) return;

    const transferId = generateId('ST', state.shipmentTransfers || []);
    const totalAmount = Number(shipmentTransferTotalAmount) || 0;

    // Create inventory transactions: remove from source shipment, add to target shipment
    const outTransactions: InventoryTransaction[] = validItems.map((item, idx) => ({
      id: generateId('IT', state.inventoryTransactions, idx),
      date: shipmentTransferDate,
      shipmentId: activeShipmentId,
      productId: item.productId,
      type: 'shipment_transfer' as const,
      fromLocation: 'warehouse',
      toLocation: `shipment:${targetShipmentId}`,
      qty: item.qty,
      referenceId: transferId,
      toShipmentId: targetShipmentId,
    }));

    const inTransactions: InventoryTransaction[] = validItems.map((item, idx) => ({
      id: generateId('IT', state.inventoryTransactions, validItems.length + idx),
      date: shipmentTransferDate,
      shipmentId: targetShipmentId,
      productId: item.productId,
      type: 'receive' as const,
      fromLocation: `shipment:${activeShipmentId}`,
      toLocation: 'warehouse',
      qty: item.qty,
      referenceId: transferId,
      fromShipmentId: activeShipmentId,
    }));

    // Create ShipmentTransfer record
    const transfer: ShipmentTransfer = {
      id: transferId,
      date: shipmentTransferDate,
      fromShipmentId: activeShipmentId,
      toShipmentId: targetShipmentId,
      items: validItems.map(item => ({
        productId: item.productId,
        qty: item.qty,
        unitCost: 0,
        total: 0,
      })),
      totalAmount,
      notes: shipmentTransferNotes || undefined,
    };

    // Only create ledger entries if there's a financial amount and bank account selected
    const newLedgerEntries: typeof state.ledger = [];
    if (totalAmount > 0 && shipmentTransferBankAccountId) {
      const accountId = shipmentTransferBankAccountId;
      newLedgerEntries.push({
        id: uuidv4(),
        date: shipmentTransferDate,
        toAccount: accountId,
        description: `Inter-shipment transfer (in) - ${state.shipments.find(s => s.id === targetShipmentId)?.name}`,
        amountIn: totalAmount,
        amountOut: 0,
        sourceModule: 'shipment_transfer' as const,
        linkedId: transferId,
        shipmentId: activeShipmentId,
      });
      newLedgerEntries.push({
        id: uuidv4(),
        date: shipmentTransferDate,
        toAccount: accountId,
        description: `Inter-shipment transfer (cost) - ${state.shipments.find(s => s.id === activeShipmentId)?.name}`,
        amountIn: 0,
        amountOut: totalAmount,
        sourceModule: 'shipment_transfer' as const,
        linkedId: transferId,
        shipmentId: targetShipmentId,
      });
    }

    updateState({
      inventoryTransactions: [...state.inventoryTransactions, ...outTransactions, ...inTransactions],
      shipmentTransfers: [...state.shipmentTransfers, transfer],
      ledger: [...state.ledger, ...newLedgerEntries],
    });

    setShowShipmentTransferModal(false);
  };

  const openShipmentPaymentModal = () => {
    setShipmentPaymentDate(new Date().toISOString().split('T')[0]);
    setShipmentPaymentTargetId('');
    setShipmentPaymentAmount('');
    setShipmentPaymentBankAccountId('');
    setShipmentPaymentNotes('');
    setShowShipmentPaymentModal(true);
  };

  const handleShipmentPayment = (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeShipmentId || !shipmentPaymentTargetId || !shipmentPaymentBankAccountId) return;
    const amount = Number(shipmentPaymentAmount);
    if (!amount || amount <= 0) return;

    const paymentId = generateId('SP', state.shipmentTransfers || []);
    const accountId = shipmentPaymentBankAccountId;
    const sourceShipmentName = state.shipments.find(s => s.id === activeShipmentId)?.name || '';
    const targetShipmentName = state.shipments.find(s => s.id === shipmentPaymentTargetId)?.name || '';

    // Two ledger entries: out from source shipment, in to target shipment (same account)
    const newLedgerEntries = [
      {
        id: uuidv4(),
        date: shipmentPaymentDate,
        toAccount: accountId,
        description: `${t('shipmentPayment')}: ${sourceShipmentName} → ${targetShipmentName}`,
        amountIn: 0,
        amountOut: amount,
        sourceModule: 'shipment_transfer' as const,
        linkedId: paymentId,
        shipmentId: activeShipmentId,
      },
      {
        id: uuidv4(),
        date: shipmentPaymentDate,
        toAccount: accountId,
        description: `${t('shipmentPayment')}: ${sourceShipmentName} → ${targetShipmentName}`,
        amountIn: amount,
        amountOut: 0,
        sourceModule: 'shipment_transfer' as const,
        linkedId: paymentId,
        shipmentId: shipmentPaymentTargetId,
      },
    ];

    updateState({
      ledger: [...state.ledger, ...newLedgerEntries],
    });

    setShowShipmentPaymentModal(false);
  };

  return (
    <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div className="flex items-center gap-3">
          <h1 className="text-xl font-bold text-slate-800">{t('inventory')}</h1>
          {!hasWriteAccess && (
            <span className="px-2 py-1 bg-amber-50 text-amber-700 border border-amber-200 rounded-md text-xs font-medium">{t('readOnlyMode')}</span>
          )}
        </div>
        {hasWriteAccess && <div className="flex flex-wrap gap-2">
          <button onClick={() => setShowReceiveModal(true)}
            className="flex items-center px-3 py-2 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 transition-colors shadow-sm text-sm"
          >
            <PackagePlus className="w-4 h-4 mr-1.5 rtl:ml-1.5 rtl:mr-0"/>
            {t('receiveNewStock')}
          </button>
          <button onClick={() => setShowTransferModal(true)}
            className="flex items-center px-3 py-2 bg-[#134e4a] text-white rounded-lg hover:bg-[#0c3531] transition-colors shadow-sm text-sm"
          >
            <ArrowRightLeft className="w-4 h-4 mr-1.5 rtl:ml-1.5 rtl:mr-0"/>
            {t('transferStock')}
          </button>
          <button onClick={() => setShowCarTransferModal(true)}
            className="flex items-center px-3 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors shadow-sm text-sm"
          >
            <ArrowRightLeft className="w-4 h-4 mr-1.5 rtl:ml-1.5 rtl:mr-0"/>
            {t('transferBetweenCars')}
          </button>
          <button onClick={openShipmentTransferModal}
            className="flex items-center px-3 py-2 bg-amber-600 text-white rounded-lg hover:bg-amber-700 transition-colors shadow-sm text-sm"
          >
            <Send className="w-4 h-4 mr-1.5 rtl:ml-1.5 rtl:mr-0"/>
            {t('transferToShipment')}
          </button>
          <button onClick={openShipmentPaymentModal}
            className="flex items-center px-3 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition-colors shadow-sm text-sm"
          >
            <DollarSign className="w-4 h-4 mr-1.5 rtl:ml-1.5 rtl:mr-0"/>
            {t('shipmentPayment')}
          </button>
        </div>}
      </div>

      {/* Search & Sort Toolbar for Mobile */}
      <div className="md:hidden bg-white p-4 rounded-xl shadow-modern glass border-slate-200 mb-4">
        <div className="flex items-center gap-2 justify-between">
          <span className="text-sm font-semibold text-slate-700">ترتيب المخزون:</span>
          <select 
            className="bg-slate-50 border border-slate-300 text-sm rounded-lg py-2 px-3 focus:ring-2 focus:ring-[#134e4a] outline-none"
            onChange={(e) => requestSort(e.target.value as any)}
            value={(sortConfig?.key as string) || 'productName'}
          >
            <option value="productName">الصنف</option>
            <option value="warehouseRemaining">مخزون المخزن</option>
          </select>
        </div>
      </div>

      {/* Main Inventory Table */}
      <div className="bg-white rounded-xl shadow-modern glass border border-slate-200 overflow-hidden">
        {/* Mobile card list */}
        <div className="md:hidden divide-y divide-slate-100">
          {sortedInventory.map((row, idx) => (
            <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: Math.min(idx * 0.05, 0.5) }} key={row.product.id} className={`p-4 space-y-3 ${row.hasNegative ? 'bg-red-50/50' : ''}`}>
              <div className="flex items-center gap-2">
                {row.hasNegative && <AlertCircle className="w-4 h-4 text-red-500 flex-shrink-0"/>}
                <span className="font-semibold text-slate-900 text-sm">{row.product.name}</span>
              </div>
              <div className="flex items-center justify-between bg-slate-100/50 rounded-lg px-3 py-2">
                <span className="text-xs text-slate-500">{t('warehouse')}</span>
                <span className={`font-bold text-sm ${row.warehouseRemaining < 0 ? 'text-red-600' : 'text-slate-700'}`}>
                  {new Intl.NumberFormat('en-US').format(row.warehouseRemaining)}
                </span>
              </div>
              {row.cars.filter(c => visibleCars.some(vc => vc.id === c.carId)).map(car => {
                const carName = visibleCars.find(vc => vc.id === car.carId)?.name;
                return (
                  <div key={car.carId} className="border border-slate-100 rounded-lg overflow-hidden">
                    <div className="bg-[#1E293B] text-white text-xs font-semibold px-3 py-1.5">{carName}</div>
                    <div className="grid grid-cols-3 divide-x rtl:divide-x-reverse divide-slate-100">
                      <div className="px-2 py-2 text-center">
                        <p className="text-xs text-slate-400 mb-0.5">{t('loadedQty')}</p>
                        <p className="text-sm font-medium text-slate-700">{new Intl.NumberFormat('en-US').format(car.loaded)}</p>
                      </div>
                      <div className="px-2 py-2 text-center">
                        <p className="text-xs text-slate-400 mb-0.5">{t('soldQty')}</p>
                        <p className="text-sm font-medium text-emerald-600">{new Intl.NumberFormat('en-US').format(car.sold)}</p>
                      </div>
                      <div className="px-2 py-2 text-center">
                        <p className="text-xs text-slate-400 mb-0.5">{t('remainingStock')}</p>
                        <p className={`text-sm font-bold ${car.remaining < 0 ? 'text-red-600' : 'text-slate-700'}`}>{new Intl.NumberFormat('en-US').format(car.remaining)}</p>
                      </div>
                    </div>
                  </div>
                );
              })}
            </motion.div>
          ))}
        </div>
        {/* Desktop table */}
        <div className="hidden md:block overflow-x-auto">
          <table className="w-full text-sm text-left rtl:text-right text-slate-600">
            <thead className="text-xs text-white uppercase bg-[#134e4a]">
              <tr>
                <th rowSpan={2} className="px-4 py-4 font-semibold align-bottom cursor-pointer group hover:bg-[#0c3531] transition-colors" onClick={() => requestSort('productName')}>
                  <div className="flex items-center gap-1">{t('product')} <SortIcon direction={sortConfig?.direction!} active={sortConfig?.key === 'productName'}/></div>
                </th>
                <th rowSpan={2} className="px-4 py-4 font-semibold text-center bg-slate-100/10 align-bottom cursor-pointer group hover:bg-[#0c3531] transition-colors" onClick={() => requestSort('warehouseRemaining')}>
                  <div className="flex items-center justify-center gap-1">{t('warehouse')} <SortIcon direction={sortConfig?.direction!} active={sortConfig?.key === 'warehouseRemaining'}/></div>
                </th>
                {visibleCars.map(car => (
                  <th key={car.id} colSpan={3} className="px-4 py-2 font-semibold text-center border-l border-slate-200 rtl:border-r rtl:border-l-0 border-b">
                    {car.name}
                  </th>
                ))}
              </tr>
              <tr className="border-b border-slate-200">
                {visibleCars.map(car => (
                  <React.Fragment key={car.id}>
                    <th className="px-2 py-2 text-center text-xs border-l border-slate-200 rtl:border-r rtl:border-l-0">{t('loadedQty')}</th>
                    <th className="px-2 py-2 text-center text-xs">{t('soldQty')}</th>
                    <th className="px-2 py-2 text-center text-xs">{t('remainingStock')}</th>
                  </React.Fragment>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {sortedInventory.map((row, idx) => {
                const stockRowClass = selectedStockRowId === row.product.id
                  ? 'bg-teal-50'
                  : row.hasNegative
                    ? 'hover:bg-[#f0fdfa] bg-red-50/50'
                    : 'hover:bg-[#f0fdfa]';
                return (
                <motion.tr initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: Math.min(idx * 0.03, 0.3) }} key={row.product.id} onClick={() => setSelectedStockRowId(row.product.id)} className={`transition-colors cursor-pointer ${stockRowClass}`}>
                  <td className="px-4 py-3 font-medium text-slate-900 flex items-center">
                    {row.hasNegative && <AlertCircle className="w-4 h-4 text-red-500 mr-2 rtl:ml-2 rtl:mr-0"/>}
                    {row.product.name}
                  </td>
                  <td className={`px-4 py-3 text-center font-bold bg-slate-100/30 ${row.warehouseRemaining < 0 ? 'text-red-600' : 'text-slate-700'}`}>
                    {new Intl.NumberFormat('en-US').format(row.warehouseRemaining)}
                  </td>
                  {row.cars.filter(c => visibleCars.some(vc => vc.id === c.carId)).map(car => (
                    <React.Fragment key={car.carId}>
                      <td className="px-2 py-3 text-center border-l border-slate-100 rtl:border-r rtl:border-l-0">
                        {new Intl.NumberFormat('en-US').format(car.loaded)}
                      </td>
                      <td className="px-2 py-3 text-center text-emerald-600">
                        {new Intl.NumberFormat('en-US').format(car.sold)}
                      </td>
                      <td className={`px-2 py-3 text-center font-bold ${car.remaining < 0 ? 'text-red-600' : 'text-slate-700'}`}>
                        {new Intl.NumberFormat('en-US').format(car.remaining)}
                      </td>
                    </React.Fragment>
                  ))}
                </motion.tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Transfer Log */}
      <div className="bg-white rounded-xl shadow-modern glass border border-slate-200 overflow-hidden mt-8">
        <div className="p-4 border-b border-slate-200 bg-slate-50/50">
          <h2 className="text-lg font-semibold text-slate-800">سجل التحويلات / Transfer Log</h2>
        </div>
        {/* Mobile card list */}
        <div className="md:hidden divide-y divide-slate-100">
          {state.inventoryTransactions
            .filter(t => t.shipmentId === activeShipmentId)
            .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
            .map(log => (
              <div key={log.id} onClick={() => { setSelectedLogRowId(log.id); setShowViewModal(log); }} className={`p-4 space-y-2 cursor-pointer transition-colors ${selectedLogRowId === log.id ? 'bg-teal-50' : 'hover:bg-[#f0fdfa]'}`}>
                <div className="flex justify-between items-start gap-2">
                  <div className="min-w-0">
                    <p className="font-semibold text-slate-900 text-sm">{state.products.find(p => p.id === log.productId)?.name}</p>
                    <p className="text-xs text-slate-500">{log.referenceId || '-'}</p>
                    <p className="text-xs text-slate-400">{format(new Date(log.date), 'dd/MM/yyyy')}</p>
                  </div>
                  <span className="font-bold text-slate-900 text-sm flex-shrink-0">
                    {new Intl.NumberFormat('en-US').format(log.qty)}
                  </span>
                </div>
                <div className="flex items-center gap-1 text-xs text-slate-500">
                  <span className="px-2 py-0.5 bg-slate-100 rounded">{log.fromLocation === 'warehouse' ? t('warehouse') : state.cars.find(c => c.id === log.fromLocation)?.name}</span>
                  <span>→</span>
                  <span className="px-2 py-0.5 bg-slate-100 rounded">{log.toLocation === 'warehouse' ? t('warehouse') : state.cars.find(c => c.id === log.toLocation)?.name}</span>
                </div>
                <div className="flex justify-end gap-1 pt-1">
                  <button onClick={(e) => { e.stopPropagation(); setShowViewModal(log); }}
                    className="p-2 text-slate-400 hover:text-[#14b8a6] hover:bg-slate-100 rounded-lg transition-colors"
                    title={t('view')}
                  >
                    <Eye className="w-4 h-4"/>
                  </button>
                  <button onClick={(e) => { e.stopPropagation(); openEditModal(log); }}
                    className="p-2 text-slate-400 hover:text-amber-600 hover:bg-amber-50 rounded-lg transition-colors"
                    title={t('edit')}
                  >
                    <Edit2 className="w-4 h-4"/>
                  </button>
                  <button onClick={(e) => { e.stopPropagation(); setShowDeleteConfirm(log); }}
                    className="p-2 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                    title={t('delete')}
                  >
                    <Trash2 className="w-4 h-4"/>
                  </button>
                </div>
              </div>
            ))}
          {state.inventoryTransactions.filter(t => t.shipmentId === activeShipmentId).length === 0 && (
            <p className="px-4 py-8 text-center text-slate-400 text-sm">{t('noData')}</p>
          )}
        </div>
        {/* Desktop table */}
        <div className="hidden md:block overflow-x-auto">
          <table className="w-full text-sm text-left rtl:text-right text-slate-600">
            <thead className="text-xs text-white uppercase bg-[#134e4a]">
              <tr>
                <th className="px-4 py-3">{t('date')}</th>
                <th className="px-4 py-3">{t('transferId')}</th>
                <th className="px-4 py-3">{t('product')}</th>
                <th className="px-4 py-3">{t('from')}</th>
                <th className="px-4 py-3">{t('to')}</th>
                <th className="px-4 py-3 text-center">{t('qty')}</th>
                <th className="px-4 py-3 text-center">{t('action')}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {state.inventoryTransactions
                .filter(t => t.shipmentId === activeShipmentId)
                .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
                .map(log => (
                  <tr key={log.id} onClick={() => { setSelectedLogRowId(log.id); setShowViewModal(log); }} className={`transition-colors cursor-pointer ${selectedLogRowId === log.id ? 'bg-teal-50' : 'hover:bg-[#f0fdfa]'}`}>
                    <td className="px-4 py-3 whitespace-nowrap">{format(new Date(log.date), 'dd/MM/yyyy')}</td>
                    <td className="px-4 py-3 font-medium text-slate-500">{log.referenceId || '-'}</td>
                    <td className="px-4 py-3 font-medium">{state.products.find(p => p.id === log.productId)?.name}</td>
                    <td className="px-4 py-3">
                      {log.fromLocation === 'warehouse' ? t('warehouse') : state.cars.find(c => c.id === log.fromLocation)?.name}
                    </td>
                    <td className="px-4 py-3">
                      {log.toLocation === 'warehouse' ? t('warehouse') : state.cars.find(c => c.id === log.toLocation)?.name}
                    </td>
                    <td className="px-4 py-3 text-center font-bold text-slate-700">
                      {new Intl.NumberFormat('en-US').format(log.qty)}
                    </td>
                    <td className="px-4 py-3 text-center">
                      <div className="flex justify-center gap-2">
                        <button onClick={(e) => { e.stopPropagation(); setShowViewModal(log); }}
                          className="p-1.5 text-slate-400 hover:text-[#14b8a6] hover:bg-slate-100 rounded-lg transition-colors"
                          title={t('view')}
                        >
                          <Eye className="w-4 h-4"/>
                        </button>
                        <button onClick={(e) => { e.stopPropagation(); openEditModal(log); }}
                          className="p-1.5 text-slate-400 hover:text-amber-600 hover:bg-amber-50 rounded-lg transition-colors"
                          title={t('edit')}
                        >
                          <Edit2 className="w-4 h-4"/>
                        </button>
                        <button onClick={(e) => { e.stopPropagation(); setShowDeleteConfirm(log); }}
                          className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                          title={t('delete')}
                        >
                          <Trash2 className="w-4 h-4"/>
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
      </div>

      <Modal isOpen={showReceiveModal} onClose={() => setShowReceiveModal(false)} title={t('receiveNewStock')}>
        <form onSubmit={handleReceiveStock} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">{t('date')}</label>
            <input type="date" required value={receiveDate} onChange={(e) => setReceiveDate(e.target.value)}
              className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 outline-none"
            />
          </div>

          <div className="space-y-3">
            <label className="block text-sm font-medium text-slate-700">{t('products')}</label>
            {receiveItems.map((item, index) => (
              <div key={index} className="flex gap-3">
                <SearchableSelect
                  required
                  value={item.productId}
                  onChange={(val) => {
                    const newItems = [...receiveItems];
                    newItems[index].productId = val;
                    setReceiveItems(newItems);
                  }}
                  options={state.products.map(p => ({ value: p.id, label: p.name }))}
                  placeholder={t('select')}
                  className="flex-1"
                />
                <input type="number" required min="1" value={item.qty || ''} onChange={(e) => {
                    const newItems = [...receiveItems];
                    newItems[index].qty = parseInt(e.target.value) || 0;
                    setReceiveItems(newItems);
                  }}
                  className="w-24 px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-emerald-500 outline-none"
                  placeholder={t('qty')}
                />
                {index === receiveItems.length - 1 && (
                  <button type="button" onClick={() => setReceiveItems([...receiveItems, { productId: '', qty: 0 }])}
                    className="px-3 py-2 bg-slate-100 text-slate-600 rounded-lg hover:bg-slate-200"
                  >
                    +
                  </button>
                )}
              </div>
            ))}
          </div>

          <div className="pt-4 flex justify-end gap-3">
            <button type="button" onClick={() => setShowReceiveModal(false)}
              className="px-5 py-2.5 bg-white border border-slate-300 text-slate-700 rounded-lg hover:bg-slate-50 font-semibold transition-colors"
            >
              {t('cancel')}
            </button>
            <button type="submit" className="px-4 py-2 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 transition-colors">
              {t('save')}
            </button>
          </div>
        </form>
      </Modal>

      <Modal isOpen={showTransferModal} onClose={() => setShowTransferModal(false)} title={t('transferStock')}>
        <form onSubmit={handleTransferStock} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">{t('date')}</label>
            <input type="date" required value={transferDate} onChange={(e) => setTransferDate(e.target.value)}
              className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-[#14b8a6] focus:border-[#14b8a6] outline-none"
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">{t('from')}</label>
              <select required value={transferFrom} onChange={(e) => setTransferFrom(e.target.value)}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-[#14b8a6] outline-none"
              >
                <option value="warehouse">{t('warehouse')}</option>
                {state.cars.map(c => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">{t('to')}</label>
              <select required value={transferTo} onChange={(e) => setTransferTo(e.target.value)}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-[#14b8a6] outline-none"
              >
                <option value="">{t('select')}</option>
                <option value="warehouse">{t('warehouse')}</option>
                {state.cars.map(c => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
            </div>
          </div>

          <div className="space-y-3">
            <label className="block text-sm font-medium text-slate-700">{t('products')}</label>
            {transferItems.map((item, index) => (
              <div key={index} className="flex gap-3">
                <SearchableSelect
                  required
                  value={item.productId}
                  onChange={(val) => {
                    const newItems = [...transferItems];
                    newItems[index].productId = val;
                    setTransferItems(newItems);
                  }}
                  options={state.products.map(p => ({ value: p.id, label: p.name }))}
                  placeholder={t('select')}
                  className="flex-1"
                />
                <input type="number" required min="1" value={item.qty || ''} onChange={(e) => {
                    const newItems = [...transferItems];
                    newItems[index].qty = parseInt(e.target.value) || 0;
                    setTransferItems(newItems);
                  }}
                  className="w-24 px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-[#14b8a6] outline-none"
                  placeholder={t('qty')}
                />
                {index === transferItems.length - 1 && (
                  <button type="button" onClick={() => setTransferItems([...transferItems, { productId: '', qty: 0 }])}
                    className="px-3 py-2 bg-slate-100 text-slate-600 rounded-lg hover:bg-slate-200"
                  >
                    +
                  </button>
                )}
              </div>
            ))}
          </div>

          <div className="pt-4 flex justify-end gap-3">
            <button type="button" onClick={() => setShowTransferModal(false)}
              className="px-5 py-2.5 bg-white border border-slate-300 text-slate-700 rounded-lg hover:bg-slate-50 font-semibold transition-colors"
            >
              {t('cancel')}
            </button>
            <button type="submit" className="px-4 py-2 bg-[#134e4a] text-white rounded-lg hover:bg-[#0c3531] transition-colors">
              {t('save')}
            </button>
          </div>
        </form>
      </Modal>
      <Modal isOpen={showCarTransferModal} onClose={() => setShowCarTransferModal(false)} title={t('transferBetweenCars')}>
        <form onSubmit={handleCarTransfer} className="space-y-4">
          {carTransferError && (
            <div className="p-3 bg-red-50 text-red-600 rounded-lg flex items-center text-sm">
              <AlertCircle className="w-4 h-4 mr-2 rtl:ml-2 rtl:mr-0"/>
              {carTransferError}
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">{t('date')}</label>
              <input type="date" required value={carTransferDate} onChange={(e) => setCarTransferDate(e.target.value)}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">{t('shipment')}</label>
              <input type="text" readOnly value={state.shipments.find(s => s.id === activeShipmentId)?.name || ''}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg bg-slate-50 text-slate-500 outline-none"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">{t('fromCar')}</label>
              <select required value={carTransferFrom} onChange={(e) => setCarTransferFrom(e.target.value)}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none"
              >
                <option value="">{t('select')}</option>
                {state.cars.map(c => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">{t('toCar')}</label>
              <select required value={carTransferTo} onChange={(e) => setCarTransferTo(e.target.value)}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none"
              >
                <option value="">{t('select')}</option>
                {state.cars.filter(c => c.id !== carTransferFrom).map(c => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
            </div>
          </div>

          <div className="space-y-3">
            <label className="block text-sm font-medium text-slate-700">{t('products')}</label>
            {carTransferItems.map((item, index) => (
              <div key={index} className="flex gap-3">
                <SearchableSelect
                  required
                  value={item.productId}
                  onChange={(val) => {
                    const newItems = [...carTransferItems];
                    newItems[index].productId = val;
                    setCarTransferItems(newItems);
                  }}
                  options={state.products.map(p => ({ value: p.id, label: p.name }))}
                  placeholder={t('select')}
                  className="flex-1"
                />
                <input type="number" required min="1" value={item.qty || ''} onChange={(e) => {
                    const newItems = [...carTransferItems];
                    newItems[index].qty = parseInt(e.target.value) || 0;
                    setCarTransferItems(newItems);
                  }}
                  className="w-24 px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none"
                  placeholder={t('qty')}
                />
                {index === carTransferItems.length - 1 && (
                  <button type="button" onClick={() => setCarTransferItems([...carTransferItems, { productId: '', qty: 0 }])}
                    className="px-3 py-2 bg-slate-100 text-slate-600 rounded-lg hover:bg-slate-200"
                  >
                    +
                  </button>
                )}
              </div>
            ))}
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">{t('notes')}</label>
            <textarea value={carTransferNotes} onChange={(e) => setCarTransferNotes(e.target.value)}
              className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 outline-none"
              rows={2}
            />
          </div>

          <div className="pt-4 flex justify-end gap-3">
            <button
              type="button"
              onClick={() => setShowCarTransferModal(false)}
              className="px-5 py-2.5 bg-white border border-slate-300 text-slate-700 rounded-lg hover:bg-slate-50 font-semibold transition-colors"
            >
              {t('cancel')}
            </button>
            <button
              type="submit"
              className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors"
            >
              {t('save')}
            </button>
          </div>
        </form>
      </Modal>

      {/* Edit Transaction Modal */}
      <Modal isOpen={!!showEditModal} onClose={() => setShowEditModal(null)} title={t('edit')} size="md">
        <form onSubmit={handleUpdateTransaction} className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">{t('date')}</label>
              <input
                type="date"
                required
                value={editDate}
                onChange={(e) => setEditDate(e.target.value)}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-[#14b8a6] outline-none"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">{t('product')}</label>
              <SearchableSelect
                required
                value={editProductId}
                onChange={(val) => setEditProductId(val)}
                options={state.products.map(p => ({ value: p.id, label: p.name }))}
                placeholder={t('select')}
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">{t('qty')}</label>
              <input
                type="number"
                required
                min="1"
                value={editQty}
                onChange={(e) => setEditQty(Number(e.target.value))}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-[#14b8a6] outline-none"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">{t('type')}</label>
              <input
                type="text"
                readOnly
                value={showEditModal?.type || ''}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg bg-slate-50 text-slate-500 outline-none"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">{t('from')}</label>
              <select
                required
                value={editFrom}
                onChange={(e) => setEditFrom(e.target.value)}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-[#14b8a6] outline-none"
              >
                <option value="warehouse">{t('warehouse')}</option>
                <option value="supplier">{t('supplier')}</option>
                {state.cars.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">{t('to')}</label>
              <select
                required
                value={editTo}
                onChange={(e) => setEditTo(e.target.value)}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-[#14b8a6] outline-none"
              >
                <option value="warehouse">{t('warehouse')}</option>
                <option value="customer">{t('customer')}</option>
                {state.cars.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>
          </div>
          <div className="pt-4 flex justify-end gap-3">
            <button
              type="button"
              onClick={() => setShowEditModal(null)}
              className="px-5 py-2.5 bg-white border border-slate-300 text-slate-700 rounded-lg hover:bg-slate-50 font-semibold transition-colors"
            >
              {t('cancel')}
            </button>
            <button
              type="submit"
              className="px-4 py-2 bg-[#134e4a] text-white rounded-lg hover:bg-[#0c3531] transition-colors"
            >
              {t('save')}
            </button>
          </div>
        </form>
      </Modal>

      {/* View Transaction Modal */}
      <Modal isOpen={!!showViewModal} onClose={() => setShowViewModal(null)} title={t('view')} size="md">
        {showViewModal && (
          <div className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-medium text-slate-500">{t('date')}</label>
                <p className="font-medium">{format(new Date(showViewModal.date), 'dd/MM/yyyy')}</p>
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-500">{t('type')}</label>
                <p className="font-medium uppercase">{showViewModal.type}</p>
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-500">{t('product')}</label>
                <p className="font-medium">{state.products.find(p => p.id === showViewModal.productId)?.name}</p>
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-500">{t('qty')}</label>
                <p className="font-bold text-lg">{new Intl.NumberFormat('en-US').format(showViewModal.qty)}</p>
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-500">{t('from')}</label>
                <p className="font-medium">
                  {showViewModal.fromLocation === 'warehouse' ? t('warehouse') :
                   showViewModal.fromLocation === 'supplier' ? t('supplier') :
                   state.cars.find(c => c.id === showViewModal.fromLocation)?.name || showViewModal.fromLocation}
                </p>
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-500">{t('to')}</label>
                <p className="font-medium">
                  {showViewModal.toLocation === 'warehouse' ? t('warehouse') :
                   showViewModal.toLocation === 'customer' ? t('customer') :
                   state.cars.find(c => c.id === showViewModal.toLocation)?.name || showViewModal.toLocation}
                </p>
              </div>
            </div>
            <div className="pt-4 border-t border-slate-100 flex justify-end">
              <button
                onClick={() => setShowViewModal(null)}
                className="px-4 py-2 bg-slate-100 text-slate-600 rounded-lg hover:bg-slate-200 transition-colors"
              >
                {t('close')}
              </button>
            </div>
          </div>
        )}
      </Modal>

      {/* Delete Confirmation Modal */}
      <Modal isOpen={!!showDeleteConfirm} onClose={() => setShowDeleteConfirm(null)} title={t('confirmDelete')} size="md">
        <div className="space-y-4">
          <p className="text-slate-600">{t('areYouSure')}</p>
          <div className="flex justify-end gap-3">
            <button
              onClick={() => setShowDeleteConfirm(null)}
              className="px-5 py-2.5 bg-white border border-slate-300 text-slate-700 rounded-lg hover:bg-slate-50 font-semibold transition-colors"
            >
              {t('no')}
            </button>
            <button
              onClick={handleDeleteTransaction}
              className="px-5 py-2.5 bg-red-600 text-white rounded-lg hover:bg-red-700 font-semibold shadow-sm transition-colors"
            >
              {t('yes')}
            </button>
          </div>
        </div>
      </Modal>

      {/* Inter-Shipment Transfer Modal */}
      <Modal isOpen={showShipmentTransferModal} onClose={() => setShowShipmentTransferModal(false)} title={t('transferToShipment')} size="lg">
        <form onSubmit={handleShipmentTransfer} className="space-y-4">
          {/* Date + From + To shipment — one row */}
          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="block text-xs font-medium text-slate-500 mb-1">{t('date')}</label>
              <input type="date" required value={shipmentTransferDate} onChange={(e) => setShipmentTransferDate(e.target.value)}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-amber-500 outline-none text-sm"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-500 mb-1">{t('fromShipment')}</label>
              <input type="text" readOnly value={state.shipments.find(s => s.id === activeShipmentId)?.name || ''}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg bg-slate-50 text-slate-500 outline-none text-sm"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-500 mb-1">{t('toShipment')}</label>
              <select required value={targetShipmentId} onChange={(e) => setTargetShipmentId(e.target.value)}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-amber-500 outline-none text-sm"
              >
                <option value="">{t('select')}</option>
                {state.shipments.filter(s => s.id !== activeShipmentId).map(s => (
                  <option key={s.id} value={s.id}>{s.name}</option>
                ))}
              </select>
            </div>
          </div>

          {/* Products — simple: product + qty per row */}
          <div className="space-y-2">
            <label className="block text-xs font-medium text-slate-500">{t('products')}</label>
            <div className="max-h-52 overflow-y-auto space-y-1.5">
              {shipmentTransferItems.map((item, index) => (
                <div key={index} className="flex gap-2 items-center">
                  <SearchableSelect
                    value={item.productId}
                    onChange={(val) => {
                      const newItems = [...shipmentTransferItems];
                      newItems[index].productId = val;
                      setShipmentTransferItems(newItems);
                    }}
                    options={state.products.map(p => ({ value: p.id, label: p.name }))}
                    placeholder={t('product')}
                    className="flex-1"
                  />
                  <input type="number" min="0" placeholder={t('qty')} value={item.qty || ''} onChange={(e) => {
                      const newItems = [...shipmentTransferItems];
                      newItems[index].qty = parseInt(e.target.value) || 0;
                      setShipmentTransferItems(newItems);
                    }}
                    className="w-20 px-2 py-1.5 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-amber-500 outline-none text-center"
                  />
                  <button type="button" onClick={() => {
                      const newItems = shipmentTransferItems.filter((_, i) => i !== index);
                      setShipmentTransferItems(newItems.length > 0 ? newItems : [{ productId: '', qty: 0 }]);
                    }}
                    className="text-red-400 hover:text-red-600 p-1"
                  >✕</button>
                </div>
              ))}
            </div>
            <button type="button" onClick={() => setShipmentTransferItems([...shipmentTransferItems, { productId: '', qty: 0 }])}
              className="text-xs text-amber-600 hover:text-amber-700 font-medium"
            >+ {t('add')}</button>
          </div>

          {/* Payment — total amount + bank account on one line */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-slate-500 mb-1">{t('totalValue')}</label>
              <input type="number" min="0" step="1" placeholder="0" value={shipmentTransferTotalAmount} onChange={(e) => setShipmentTransferTotalAmount(e.target.value ? Number(e.target.value) : '')}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-amber-500 outline-none text-sm"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-500 mb-1">{t('bankAccount')}</label>
              <select value={shipmentTransferBankAccountId} onChange={(e) => setShipmentTransferBankAccountId(e.target.value)}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-amber-500 outline-none text-sm"
              >
                <option value="">{t('none')}</option>
                {state.bankAccounts.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
              </select>
            </div>
          </div>

          {/* Notes */}
          <div>
            <label className="block text-xs font-medium text-slate-500 mb-1">{t('notes')}</label>
            <input type="text" value={shipmentTransferNotes} onChange={(e) => setShipmentTransferNotes(e.target.value)}
              className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-amber-500 outline-none text-sm"
            />
          </div>

          <div className="flex justify-end gap-3">
            <button type="button" onClick={() => setShowShipmentTransferModal(false)}
              className="px-5 py-2.5 bg-white border border-slate-300 text-slate-700 rounded-lg hover:bg-slate-50 font-semibold transition-colors"
            >{t('cancel')}</button>
            <button type="submit"
              className="px-5 py-2.5 bg-amber-600 text-white rounded-lg hover:bg-amber-700 font-semibold shadow-sm transition-colors"
            >{t('save')}</button>
          </div>
        </form>
      </Modal>

      {/* Inter-Shipment Payment Modal */}
      <Modal isOpen={showShipmentPaymentModal} onClose={() => setShowShipmentPaymentModal(false)} title={t('shipmentPayment')} size="md">
        <form onSubmit={handleShipmentPayment} className="space-y-4">
          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="block text-xs font-medium text-slate-500 mb-1">{t('date')}</label>
              <input type="date" required value={shipmentPaymentDate} onChange={(e) => setShipmentPaymentDate(e.target.value)}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-purple-500 outline-none text-sm"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-500 mb-1">{t('fromShipment')}</label>
              <input type="text" readOnly value={state.shipments.find(s => s.id === activeShipmentId)?.name || ''}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg bg-slate-50 text-slate-500 outline-none text-sm"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-500 mb-1">{t('toShipment')}</label>
              <select required value={shipmentPaymentTargetId} onChange={(e) => setShipmentPaymentTargetId(e.target.value)}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-purple-500 outline-none text-sm"
              >
                <option value="">{t('select')}</option>
                {state.shipments.filter(s => s.id !== activeShipmentId).map(s => (
                  <option key={s.id} value={s.id}>{s.name}</option>
                ))}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-slate-500 mb-1">{t('amount')}</label>
              <input type="number" min="1" step="1" required placeholder="0" value={shipmentPaymentAmount} onChange={(e) => setShipmentPaymentAmount(e.target.value ? Number(e.target.value) : '')}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-purple-500 outline-none text-sm"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-500 mb-1">{t('bankAccount')}</label>
              <select required value={shipmentPaymentBankAccountId} onChange={(e) => setShipmentPaymentBankAccountId(e.target.value)}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-purple-500 outline-none text-sm"
              >
                <option value="">{t('select')}</option>
                {state.bankAccounts.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
              </select>
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-500 mb-1">{t('notes')}</label>
            <input type="text" value={shipmentPaymentNotes} onChange={(e) => setShipmentPaymentNotes(e.target.value)}
              className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-purple-500 outline-none text-sm"
            />
          </div>

          <div className="flex justify-end gap-3">
            <button type="button" onClick={() => setShowShipmentPaymentModal(false)}
              className="px-5 py-2.5 bg-white border border-slate-300 text-slate-700 rounded-lg hover:bg-slate-50 font-semibold transition-colors"
            >{t('cancel')}</button>
            <button type="submit"
              className="px-5 py-2.5 bg-purple-600 text-white rounded-lg hover:bg-purple-700 font-semibold shadow-sm transition-colors"
            >{t('save')}</button>
          </div>
        </form>
      </Modal>
    </motion.div>
  );
}
