'use client'

// src/app/materials/page.tsx
// M3 Materials — functional inventory tracking page.
// Replaces the MOCK page. Planner manually manages stock levels and thresholds.

import { useState, useEffect, useCallback } from 'react'
import AddMaterialModal from '@/components/materials/AddMaterialModal'
import EditMaterialModal, { type SerializedMaterial } from '@/components/materials/EditMaterialModal'
import MaterialsTable from '@/components/materials/MaterialsTable'
import TransactionHistoryModal from '@/components/materials/TransactionHistoryModal'
import ImportMaterialReportModal from '@/components/materials/ImportMaterialReportModal'
import ImportKnittingModal from '@/components/materials/ImportKnittingModal'
import MaterialSidePanel from '@/components/materials/MaterialSidePanel'

import HDPETab from '@/components/materials/HDPETab'
import MBTab from '@/components/materials/MBTab'
import KoreaTab from '@/components/materials/KoreaTab'
import ExtruderTab from '@/components/materials/ExtruderTab'
import ImportExtruderModal from '@/components/materials/ImportExtruderModal'
import WarpingTab from '@/components/materials/WarpingTab'
import ImportWarpingModal from '@/components/materials/ImportWarpingModal'
import KnittingDetailTab from '@/components/materials/KnittingDetailTab'
import ImportKnittingDetailModal from '@/components/materials/ImportKnittingDetailModal'
import RollingTab from '@/components/materials/RollingTab'
import ImportRollingReportModal from '@/components/materials/ImportRollingReportModal'
import PackingTab from '@/components/materials/PackingTab'
import ImportPackingReportModal from '@/components/materials/ImportPackingReportModal'


// Note: metadata export is not supported in 'use client' components.
// Page title is set via the <title> in the HTML head from layout.tsx.

// ── Summary card ──────────────────────────────────────────────────────────────

interface SummaryCardProps {
  label: string
  value: string | number
  icon: string
  accent: string
  border: string
}

function SummaryCard({ label, value, icon, accent, border }: SummaryCardProps) {
  return (
    <div className={`bg-surface-container-lowest border-[0.5px] ${border} rounded-xl px-6 py-4`}>
      <div className="flex items-center gap-3 mb-2">
        <span className={`material-symbols-outlined text-[22px] ${accent}`}>{icon}</span>
        <p className="text-xs font-inter font-medium text-secondary uppercase tracking-widest">{label}</p>
      </div>
      <p className={`text-3xl font-inter font-semibold tabular-nums ${accent}`}>{value}</p>
    </div>
  )
}

// ── Delete confirmation dialog ─────────────────────────────────────────────────

interface DeleteDialogProps {
  material: SerializedMaterial
  onConfirm: () => void
  onCancel: () => void
  isDeleting: boolean
}

function DeleteDialog({ material, onConfirm, onCancel, isDeleting }: DeleteDialogProps) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
      <div className="bg-surface-container-lowest border-[0.5px] border-outline-variant rounded-xl p-6 max-w-sm w-full shadow-2xl">
        <div className="flex items-start gap-3 mb-4">
          <span className="material-symbols-outlined text-[24px] text-error shrink-0 mt-0.5">warning</span>
          <div>
            <p className="text-sm font-inter font-semibold text-on-surface">Xóa nguyên liệu?</p>
            <p className="text-xs text-secondary mt-1">
              Xóa <strong>{material.name}</strong>. Hành động này không thể hoàn tác.
            </p>
          </div>
        </div>
        <div className="flex justify-end gap-2">
          <button
            onClick={onCancel}
            disabled={isDeleting}
            className="inline-flex items-center justify-center border border-primary bg-transparent hover:bg-surface-container text-primary text-sm font-medium px-4 py-2 h-9 rounded-md transition-colors disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            disabled={isDeleting}
            className="inline-flex items-center justify-center border border-[#ba1a1a] text-[#ba1a1a] hover:bg-[#ba1a1a]/10 bg-transparent text-sm font-medium px-4 py-2 h-9 rounded-md transition-colors disabled:opacity-60"
          >
            {isDeleting ? 'Đang xóa…' : 'Xóa'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function MaterialsPage() {
  const [materials, setMaterials]     = useState<SerializedMaterial[]>([])
  const [isLoading, setIsLoading]     = useState(true)
  const [fetchError, setFetchError]   = useState<string | null>(null)
  const [showAddModal, setShowAddModal]       = useState(false)
  const [showImportModal, setShowImportModal]           = useState(false)
  const [showKnittingModal, setShowKnittingModal]       = useState(false)
  const [panelMaterial, setPanelMaterial]               = useState<SerializedMaterial | null>(null)
  const [editTarget, setEditTarget]                     = useState<SerializedMaterial | null>(null)
  const [deleteTarget, setDeleteTarget]       = useState<SerializedMaterial | null>(null)
  const [historyTarget, setHistoryTarget]     = useState<SerializedMaterial | null>(null)
  const [isDeleting, setIsDeleting]           = useState(false)
  
  const [showExtruderModal, setShowExtruderModal]       = useState(false)
  const [showWarpingModal, setShowWarpingModal]         = useState(false)
  const [showKnittingDetailModal, setShowKnittingDetailModal] = useState(false)
  const [showRollingModal, setShowRollingModal]         = useState(false)
  
  const [activeTab, setActiveTab] = useState<'EXTRUDER' | 'WARPING' | 'KNITTING_DETAIL' | 'ROLLING' | 'PACKING' | 'HDPE' | 'MB' | 'KOREA'>('EXTRUDER')

  // ── Fetch all materials ────────────────────────────────────────────────────

  const fetchMaterials = useCallback(async () => {
    setIsLoading(true)
    setFetchError(null)
    try {
      const res = await fetch('/api/materials')
      const data = await res.json() as { success: boolean; materials?: SerializedMaterial[]; error?: string }
      if (!res.ok || !data.success) { setFetchError(data.error ?? 'Không thể tải dữ liệu.'); return }
      setMaterials(data.materials ?? [])
    } catch {
      setFetchError('Lỗi mạng — không thể kết nối máy chủ.')
    } finally {
      setIsLoading(false)
    }
  }, [])

  useEffect(() => { fetchMaterials() }, [fetchMaterials])

  // ── Delete handler ─────────────────────────────────────────────────────────

  const handleDeleteConfirm = async () => {
    if (!deleteTarget) return
    setIsDeleting(true)
    try {
      const res = await fetch(`/api/materials/${deleteTarget.id}`, { method: 'DELETE' })
      const data = await res.json() as { success: boolean; error?: string }
      if (!res.ok || !data.success) { setFetchError(data.error ?? 'Không thể xóa nguyên liệu.'); return }
      setDeleteTarget(null)
      await fetchMaterials()
    } catch {
      setFetchError('Lỗi mạng — không thể kết nối máy chủ.')
    } finally {
      setIsDeleting(false)
    }
  }

  // ── Derived summary stats (null-safe) ──────────────────────────────────────

  const activeMaterials = materials.filter(m => m.group === activeTab)

  // Only count materials where minThreshold is set (not null)
  const lowStockCount = activeMaterials.filter((m) => {
    if (m.minThreshold == null) return false
    return parseFloat(m.currentStock) < parseFloat(m.minThreshold)
  }).length

  const totalKg = activeMaterials.reduce((sum, m) => sum + parseFloat(m.currentStock), 0)

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className="max-w-[1440px] mx-auto px-8 py-8">

      {/* Page header */}
      <div className="flex items-start justify-between mb-6">
        <div>
          <h1 className="text-2xl font-inter font-semibold text-primary tracking-tight">Materials</h1>
          <p className="text-sm font-noto text-secondary mt-1">Quản lý tồn kho nguyên liệu</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            id="btn-download-knitting-template"
            onClick={() => window.location.href = '/api/knitting/template'}
            className="inline-flex items-center justify-center gap-2 border border-outline bg-surface hover:bg-surface-container text-on-surface text-sm font-medium px-4 py-2 h-9 rounded-md transition-colors"
          >
            <span className="material-symbols-outlined text-[18px]">download</span>
            Tải mẫu Dệt
          </button>
          <button
            id="btn-import-knitting-report"
            onClick={() => setShowKnittingModal(true)}
            className="inline-flex items-center justify-center gap-2 border border-primary bg-transparent hover:bg-surface-container text-primary text-sm font-medium px-4 py-2 h-9 rounded-md transition-colors"
          >
            <span className="material-symbols-outlined text-[18px]">table_chart</span>
            Import Knitting
          </button>
          <button
            id="btn-add-material"
            onClick={() => setShowAddModal(true)}
            className="inline-flex items-center justify-center gap-2 bg-primary text-on-primary text-sm font-medium px-4 py-2 h-9 rounded-md hover:bg-primary/90 transition-colors shadow-sm"
          >
            <span className="material-symbols-outlined text-[18px]">add</span>
            Thêm NVL
          </button>
        </div>
      </div>

      {/* Error banner */}
      {fetchError && (
        <div className="flex items-start gap-2 border border-error/40 bg-error-container rounded-lg px-4 py-3 mb-4">
          <span className="material-symbols-outlined text-[20px] text-error shrink-0">error</span>
          <p className="text-sm font-inter text-error">{fetchError}</p>
        </div>
      )}

      {/* Tab Navigation */}
      <div className="flex gap-2 border-b-[0.5px] border-outline-variant mb-6 overflow-x-auto">
        {(['EXTRUDER', 'WARPING', 'KNITTING_DETAIL', 'ROLLING', 'PACKING', 'HDPE', 'MB', 'KOREA'] as const).map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`px-4 py-2.5 text-sm font-medium transition-colors border-b-2 -mb-[1px] whitespace-nowrap ${
              activeTab === tab
                ? 'border-primary text-primary font-semibold'
                : 'border-transparent text-secondary hover:text-on-surface'
            }`}
          >
            {tab === 'EXTRUDER'
              ? 'Extruder'
              : tab === 'WARPING'
              ? 'Warping'
              : tab === 'KNITTING_DETAIL'
              ? 'Knitting Detail'
              : tab === 'ROLLING'
              ? 'Rolling'
              : tab === 'PACKING'
              ? 'Đóng gói'
              : tab === 'MB'
              ? 'Masterbatch'
              : tab === 'KOREA'
              ? 'Korea & Khác'
              : tab}
          </button>
        ))}
      </div>

      {/* Summary cards (Material stock - only shown for material tabs) */}
      {(activeTab !== 'EXTRUDER' && activeTab !== 'WARPING' && activeTab !== 'KNITTING_DETAIL' && activeTab !== 'ROLLING' && activeTab !== 'PACKING') && (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
          <SummaryCard
            label="Total Materials"
            value={activeMaterials.length}
            icon="inventory_2"
            accent="text-on-surface"
            border="border-outline-variant"
          />
          <SummaryCard
            label="Low Stock Alerts"
            value={lowStockCount}
            icon="warning"
            accent={lowStockCount > 0 ? 'text-error' : 'text-[#15803d]'}
            border={lowStockCount > 0 ? 'border-error/30' : 'border-[#22c55e]/30'}
          />
          <SummaryCard
            label="Total Stock"
            value={`${totalKg.toLocaleString('vi-VN', { minimumFractionDigits: 0, maximumFractionDigits: 1 })} kg`}
            icon="scale"
            accent="text-primary"
            border="border-primary/20"
          />
        </div>
      )}

      {/* Table or loading */}
      {isLoading ? (
        <div className="flex items-center justify-center py-16">
          <svg className="w-6 h-6 animate-spin text-primary" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
          </svg>
        </div>
      ) : (
        <>
          {activeTab === 'EXTRUDER' && (
            <ExtruderTab
              onImport={() => setShowExtruderModal(true)}
            />
          )}
          {activeTab === 'WARPING' && (
            <WarpingTab
              onImport={() => setShowWarpingModal(true)}
            />
          )}
          {activeTab === 'KNITTING_DETAIL' && (
            <KnittingDetailTab
              onImport={() => setShowKnittingDetailModal(true)}
            />
          )}
          {activeTab === 'ROLLING' && (
            <RollingTab
              onImport={() => setShowRollingModal(true)}
            />
          )}
          {activeTab === 'PACKING' && (
            <PackingTab />
          )}
          {activeTab === 'HDPE' && (
            <HDPETab
              materials={activeMaterials}
              onEdit={setEditTarget}
              onDelete={setDeleteTarget}
              onHistory={setHistoryTarget}
              onRowClick={setPanelMaterial}
              onImport={() => setShowImportModal(true)}
            />
          )}
          {activeTab === 'MB' && (
            <MBTab
              materials={activeMaterials}
              onEdit={setEditTarget}
              onDelete={setDeleteTarget}
              onHistory={setHistoryTarget}
              onRowClick={setPanelMaterial}
              onImport={() => setShowImportModal(true)}
            />
          )}
          {activeTab === 'KOREA' && (
            <KoreaTab
              materials={activeMaterials}
              onEdit={setEditTarget}
              onDelete={setDeleteTarget}
              onHistory={setHistoryTarget}
              onRowClick={setPanelMaterial}
              onImport={() => setShowImportModal(true)}
            />
          )}
        </>
      )}

      {/* Add modal */}
      {showAddModal && (
        <AddMaterialModal
          defaultGroup={(activeTab === 'HDPE' || activeTab === 'MB' || activeTab === 'KOREA') ? activeTab : 'HDPE'}
          onAdded={() => { fetchMaterials(); setShowAddModal(false) }}
          onClose={() => setShowAddModal(false)}
        />
      )}

      {/* Import Excel report modal */}
      {showImportModal && (
        <ImportMaterialReportModal
          onImported={fetchMaterials}
          onClose={() => { setShowImportModal(false); fetchMaterials() }}
        />
      )}

      {/* Import Extruder Report modal */}
      {showExtruderModal && (
        <ImportExtruderModal
          onImported={() => {}}
          onClose={() => setShowExtruderModal(false)}
        />
      )}

      {/* Import Warping Report modal */}
      {showWarpingModal && (
        <ImportWarpingModal
          onImported={() => {}}
          onClose={() => setShowWarpingModal(false)}
        />
      )}

      {/* Import Knitting Detail Report modal */}
      {showKnittingDetailModal && (
        <ImportKnittingDetailModal
          onImported={() => {}}
          onClose={() => setShowKnittingDetailModal(false)}
        />
      )}

      {/* Import Rolling Report modal */}
      {showRollingModal && (
        <ImportRollingReportModal
          onImported={() => {}}
          onClose={() => setShowRollingModal(false)}
        />
      )}

      {/* Import Knitting Report modal */}
      {showKnittingModal && (
        <ImportKnittingModal
          onImported={() => {}}
          onClose={() => setShowKnittingModal(false)}
        />
      )}

      {/* Edit modal */}
      {editTarget && (
        <EditMaterialModal
          material={editTarget}
          onUpdated={() => { fetchMaterials(); setEditTarget(null) }}
          onClose={() => setEditTarget(null)}
        />
      )}

      {/* Transaction history modal */}
      {historyTarget && (
        <TransactionHistoryModal
          material={historyTarget}
          onClose={() => setHistoryTarget(null)}
          onStockChanged={fetchMaterials}
        />
      )}

      {/* Delete confirmation */}
      {deleteTarget && (
        <DeleteDialog
          material={deleteTarget}
          onConfirm={handleDeleteConfirm}
          onCancel={() => setDeleteTarget(null)}
          isDeleting={isDeleting}
        />
      )}

      {/* Side Panel for threshold & transactions */}
      {panelMaterial && (
        <MaterialSidePanel
          material={panelMaterial}
          isOpen={!!panelMaterial}
          onClose={() => setPanelMaterial(null)}
          onUpdated={fetchMaterials}
        />
      )}
    </div>
  )
}
