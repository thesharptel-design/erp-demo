'use client'

import { formatWriterDepartmentLabel } from '@/lib/approval-draft'
import type { ApprovalRole } from '@/lib/approval-roles'
import { APPROVAL_ROLES, getApprovalRoleLabel } from '@/lib/approval-roles'
import SearchableCombobox from '@/components/SearchableCombobox'
import type { ApprovalDraftAppUser, ApprovalOrderItem } from '@/components/approvals/ApprovalDraftPaper'

type ApprovalLineDnDProps = {
  lines: ApprovalOrderItem[]
  users: ApprovalDraftAppUser[]
  deptMap: Map<number, string>
  onLineRoleChange: (lineId: string, role: ApprovalRole) => void
  onLineAssigneeChange: (lineId: string, userId: string) => void
  onLineAdd: () => void
  onLineRemove: (lineId: string) => void
  onLineMove: (draggedId: string, targetId: string) => void
}

export default function ApprovalLineDnD({
  lines,
  users,
  deptMap,
  onLineRoleChange,
  onLineAssigneeChange,
  onLineAdd,
  onLineRemove,
  onLineMove,
}: ApprovalLineDnDProps) {
  const assigneeOptions = users.map((user) => {
    const deptLabel = formatWriterDepartmentLabel(user, deptMap)
    return {
      value: user.id,
      label: `${user.user_name} / ${deptLabel}${user.can_approval_participate ? '' : ' [결재권 없음]'}`,
      keywords: [user.user_name, user.login_id, user.role_name, deptLabel],
      disabled: !user.can_approval_participate,
    }
  })

  return (
    <div className="space-y-2">
      {lines.map((line, idx) => (
        <div
          key={line.id}
          draggable
          onDragStart={(event) => {
            event.dataTransfer.setData('text/plain', line.id)
            event.dataTransfer.effectAllowed = 'move'
          }}
          onDragOver={(event) => {
            event.preventDefault()
            event.dataTransfer.dropEffect = 'move'
          }}
          onDrop={(event) => {
            event.preventDefault()
            const draggedId = event.dataTransfer.getData('text/plain')
            if (!draggedId || draggedId === line.id) return
            onLineMove(draggedId, line.id)
          }}
          className="grid grid-cols-1 items-center gap-2 rounded-lg border border-gray-200 bg-white p-2 sm:grid-cols-[auto_100px_1fr_auto]"
        >
          <span
            className="inline-flex w-fit cursor-move rounded border border-dashed border-gray-300 px-2 py-1 text-[10px] font-black text-gray-500"
            title="드래그해서 순서를 변경하세요"
          >
            {idx + 1}차
          </span>
          <select
            value={line.role}
            onChange={(event) => onLineRoleChange(line.id, event.target.value as ApprovalRole)}
            className="rounded border border-gray-300 px-2 py-1.5 text-xs font-bold text-gray-700 sm:w-[100px]"
          >
            {APPROVAL_ROLES.map((role) => (
              <option key={role} value={role}>
                {getApprovalRoleLabel(role)}
              </option>
            ))}
          </select>
          <SearchableCombobox
            value={line.userId}
            onChange={(nextValue) => onLineAssigneeChange(line.id, nextValue)}
            options={assigneeOptions}
            placeholder={
              line.role === 'approver'
                ? '결재자 선택 (필수)'
                : line.role === 'reviewer'
                  ? '참조자 선택'
                  : '협조자 선택'
            }
          />
          <button
            type="button"
            onClick={() => onLineRemove(line.id)}
            className="rounded border border-red-200 px-2 py-1 text-[11px] font-black text-red-600 sm:w-auto"
          >
            삭제
          </button>
        </div>
      ))}
      <button
        type="button"
        onClick={onLineAdd}
        className="rounded border border-dashed border-blue-300 px-3 py-1.5 text-xs font-black text-blue-700"
      >
        + 결재라인 추가
      </button>
    </div>
  )
}
