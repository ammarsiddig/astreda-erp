import React, { useState, useEffect } from 'react';
import { useTranslation } from '../hooks/useTranslation';
import { useAppStore } from '../store';
import { Plus, Trash2 } from 'lucide-react';
import { buildLedgerEntryId, dateTimeFromDateString, formatCurrency, generateId, getCurrentDateInputValue } from '../lib/utils';
import Modal from './Modal';
import SearchableSelect from './SearchableSelect';
import { Invoice, InvoiceLine } from '../types';
import { isSalesperson } from '../lib/permissions';

interface InvoiceModalProps {
  isOpen: boolean;
  onClose: () => void;
  invoiceToEdit?: Invoice | null;
}

export default function InvoiceModal({ isOpen, onClose, invoiceToEdit }: InvoiceModalProps) {
  const { t } = useTranslation();
  const { state, updateState, activeShipmentId } = useAppStore();
  const currentUser = state.currentUser;
  const isSpRole = isSalesperson(currentUser, state.roles);
  const availableCustomers = isSpRole && currentUser?.salespersonId
    ? state.customers.filter(c => c.salespersonId === currentUser.salespersonId)
    : state.customers;

  const [invoiceDate, setInvoiceDate] = useState(getCurrentDateInputValue());
  const [customerId, setCustomerId] = useState('');
  const [cityId, setCityId] = useState('');
  const [carId, setCarId] = useState('');
  const [paymentType, setPaymentType] = useState<'cash' | 'credit'>('credit');
  const [bankAccountId, setBankAccountId] = useState('');
  const [lines, setLines] = useState<InvoiceLine[]>([{ productId: '', qty: 0, unitPrice: 0, total: 0 }]);

  useEffect(() => {
    if (invoiceToEdit) {
      setInvoiceDate(invoiceToEdit.date.slice(0, 10));
      setCustomerId(invoiceToEdit.customerId);
      setCityId(invoiceToEdit.cityId);
      setCarId(invoiceToEdit.carId);
      setPaymentType(invoiceToEdit.paymentType);
      setBankAccountId(invoiceToEdit.bankAccountId || '');
      setLines(invoiceToEdit.lines);
    } else {
      setInvoiceDate(getCurrentDateInputValue());
      setCustomerId('');
      setCityId('');
      setCarId('');
      setPaymentType('credit');
      setBankAccountId('');
      setLines([{ productId: '', qty: 0, unitPrice: 0, total: 0 }]);
    }
  }, [invoiceToEdit, isOpen]);

  const selectedCustomer = state.customers.find(c => c.id === customerId);
  const salespersonId = selectedCustomer?.salespersonId || '';
  const salespersonName = state.salespeople.find(s => s.id === salespersonId)?.name || '';
  const cityName = state.cities.find(c => c.id === cityId)?.name || '';
  const carName = state.cars.find(c => c.id === carId)?.name || '';

  const handleCustomerChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const newCustomerId = e.target.value;
    setCustomerId(newCustomerId);
    const customer = state.customers.find(c => c.id === newCustomerId);
    if (customer) {
      setCityId(customer.cityId);
      setCarId(customer.carId);
    } else {
      setCityId('');
      setCarId('');
    }
  };

  const handleAddLine = () => {
    setLines([...lines, { productId: '', qty: 0, unitPrice: 0, total: 0 }]);
  };

  const handleLineChange = (index: number, field: keyof InvoiceLine, value: any) => {
    const newLines = [...lines];
    newLines[index] = { ...newLines[index], [field]: value };

    if (field === 'qty' || field === 'unitPrice') {
      newLines[index].total = (newLines[index].qty || 0) * (newLines[index].unitPrice || 0);
    }

    setLines(newLines);
  };

  const handleRemoveLine = (index: number) => {
    if (lines.length > 1) {
      setLines(lines.filter((_, i) => i !== index));
    }
  };

  const invoiceTotal = lines.reduce((sum, line) => sum + line.total, 0);

  const handleSaveInvoice = (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeShipmentId || !customerId || !salespersonId || !cityId || !carId) return;
    if (paymentType === 'cash' && !bankAccountId) return;

    const validLines = lines.filter(l => l.productId && l.qty > 0 && l.unitPrice > 0);
    if (validLines.length === 0) return;

    const invoiceId = invoiceToEdit ? invoiceToEdit.id : generateId('INV', state.invoices);

    const newInvoice: Invoice = {
      id: invoiceId,
      date: dateTimeFromDateString(invoiceDate),
      customerId,
      salespersonId,
      cityId,
      carId,
      shipmentId: activeShipmentId,
      lines: validLines,
      total: invoiceTotal,
      paymentType,
      bankAccountId: paymentType === 'cash' ? bankAccountId : undefined,
    };

    let updatedInvoices = [...state.invoices];
    let updatedInventoryTransactions = [...state.inventoryTransactions];
    let updatedLedger = [...state.ledger];

    if (invoiceToEdit) {
      // Update existing invoice
      updatedInvoices = updatedInvoices.map(inv => inv.id === invoiceId ? newInvoice : inv);

      // Remove old inventory transactions
      updatedInventoryTransactions = updatedInventoryTransactions.filter(
        t => t.referenceId !== invoiceId && t.invoiceId !== invoiceId
      );

      // Remove old ledger entry
      updatedLedger = updatedLedger.filter(
        l => l.linkedId !== invoiceId && l.referenceId !== invoiceId && l.invoiceId !== invoiceId
      );
    } else {
      // Add new invoice
      updatedInvoices.push(newInvoice);
    }

    // Create new inventory transactions
    const newInventoryTransactions = validLines.map((line, idx) => ({
      id: generateId('IT', state.inventoryTransactions, idx),
      date: dateTimeFromDateString(invoiceDate),
      shipmentId: activeShipmentId,
      productId: line.productId,
      type: 'sell' as const,
      fromLocation: carId,
      toLocation: 'customer',
      qty: line.qty,
      referenceId: invoiceId,
      invoiceId: invoiceId,
    }));
    updatedInventoryTransactions.push(...newInventoryTransactions);

    // Create new ledger entry if cash
    if (paymentType === 'cash' && bankAccountId) {
      updatedLedger.push({
        id: buildLedgerEntryId('sale_cash', invoiceId, 0, activeShipmentId),
        date: dateTimeFromDateString(invoiceDate),
        toAccount: bankAccountId,
        description: `فاتورة مبيعات نقدية #${invoiceId}`,
        amountIn: invoiceTotal,
        amountOut: 0,
        sourceModule: 'sale_cash' as const,
        linkedId: invoiceId,
        referenceId: invoiceId,
        invoiceId: invoiceId,
        shipmentId: activeShipmentId,
      });
    }

    updateState({
      invoices: updatedInvoices,
      inventoryTransactions: updatedInventoryTransactions,
      ledger: updatedLedger,
    });

    onClose();
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={invoiceToEdit ? t('editInvoice') : t('newInvoice')} size="2xl">
      <form onSubmit={handleSaveInvoice} className="space-y-4">
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">{t('date')}</label>
            <input type="date" required value={invoiceDate} onChange={(e) => setInvoiceDate(e.target.value)}
              className="w-full px-3 py-2.5 border border-slate-300 rounded-lg focus:ring-2 focus:ring-[#14b8a6] focus:border-[#14b8a6] outline-none"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">{t('customer')}</label>
            <SearchableSelect
              required
              value={customerId}
              onChange={(val) => handleCustomerChange({ target: { value: val } } as any)}
              options={availableCustomers.map(c => ({ value: c.id, label: c.name }))}
              placeholder={t('select')}
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">{t('salesperson')}</label>
            <input type="text" readOnly value={salespersonName} className="w-full px-3 py-2 border border-slate-300 rounded-lg bg-slate-50 text-slate-500 outline-none" placeholder={t('autoFilled')}/>
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">{t('city')}</label>
            <input type="text" readOnly value={cityName} className="w-full px-3 py-2 border border-slate-300 rounded-lg bg-slate-50 text-slate-500 outline-none" placeholder={t('autoFilled')}/>
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">{t('car')}</label>
            <input type="text" readOnly value={carName} className="w-full px-3 py-2 border border-slate-300 rounded-lg bg-slate-50 text-slate-500 outline-none" placeholder={t('autoFilled')}/>
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">{t('paymentType')}</label>
            <select required value={paymentType} onChange={(e) => setPaymentType(e.target.value as any)}
              className="w-full px-3 py-2.5 border border-slate-300 rounded-lg focus:ring-2 focus:ring-[#14b8a6] focus:border-[#14b8a6] outline-none"
            >
              <option value="cash">{t('cash')}</option>
              <option value="credit">{t('credit')}</option>
            </select>
          </div>
          {paymentType === 'cash' && (
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">{t('bankAccount')}</label>
              <select required value={bankAccountId} onChange={(e) => setBankAccountId(e.target.value)}
                className="w-full px-3 py-2.5 border border-slate-300 rounded-lg focus:ring-2 focus:ring-[#14b8a6] focus:border-[#14b8a6] outline-none"
              >
                <option value="">{t('select')}</option>
                {state.bankAccounts.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
              </select>
            </div>
          )}
        </div>

        <div className="space-y-3">
          <div className="flex justify-between items-center">
            <label className="block text-sm font-medium text-slate-700">{t('products')}</label>
            <button type="button" onClick={handleAddLine} className="text-sm text-[#134e4a] hover:underline flex items-center">
              <Plus className="w-4 h-4 mr-1 rtl:ml-1 rtl:mr-0"/>
              {t('add')}
            </button>
          </div>

          {lines.map((line, index) => (
            <div key={index} className="flex gap-2 items-start">
              <div className="flex-1">
                <SearchableSelect
                  required
                  value={line.productId}
                  onChange={(val) => handleLineChange(index, 'productId', val)}
                  options={state.products.map(p => ({ value: p.id, label: p.name }))}
                  placeholder={t('product')}
                />
              </div>
              <div className="w-20">
                <input type="number" required min="1" value={line.qty || ''} onChange={(e) => handleLineChange(index, 'qty', parseInt(e.target.value) || 0)}
                  className="w-full px-3 py-2.5 border border-slate-300 rounded-lg focus:ring-2 focus:ring-[#14b8a6] focus:border-[#14b8a6] outline-none text-sm"
                  placeholder={t('qty')}
                />
              </div>
              <div className="w-28">
                <input type="number" required min="0" step="0.01" value={line.unitPrice || ''} onChange={(e) => handleLineChange(index, 'unitPrice', parseFloat(e.target.value) || 0)}
                  className="w-full px-3 py-2.5 border border-slate-300 rounded-lg focus:ring-2 focus:ring-[#14b8a6] focus:border-[#14b8a6] outline-none text-sm"
                  placeholder={t('unitPrice')}
                />
              </div>
              <div className="w-28 px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm font-medium text-slate-700 text-right rtl:text-left">
                {new Intl.NumberFormat('en-US').format(line.total)}
              </div>
              <button type="button" onClick={() => handleRemoveLine(index)}
                className="p-2 text-red-500 hover:bg-red-50 rounded-lg transition-colors"
              >
                <Trash2 className="w-4 h-4"/>
              </button>
            </div>
          ))}
        </div>

        <div className="pt-4 border-t border-slate-100 flex justify-between items-center">
          <div className="text-lg font-bold text-slate-900">
            {t('total')}: {formatCurrency(invoiceTotal)}
          </div>
          <div className="flex gap-3">
            <button type="button" onClick={onClose} className="px-5 py-2.5 bg-white border border-slate-300 text-slate-700 rounded-lg hover:bg-slate-50 font-semibold transition-colors">
              {t('cancel')}
            </button>
            <button type="submit" className="px-5 py-2.5 bg-[#134e4a] text-white rounded-lg hover:bg-[#0c3531] font-semibold shadow-sm transition-colors">
              {t('save')}
            </button>
          </div>
        </div>
      </form>
    </Modal>
  );
}
