"use client"

import type { Tool } from "@prisma/client"
import type { Table } from "@tanstack/react-table"
import { PlayIcon } from "lucide-react"
import { toast } from "sonner"
import { useServerAction } from "zsa-react"
import { ToolsScheduleDialog } from "~/app/admin/tools/_components/tools-schedule-dialog"
import { processTools } from "~/app/admin/tools/_lib/actions"
import { Button } from "~/components/admin/ui/button"
import { ToolsDeleteDialog } from "./tools-delete-dialog"

interface ToolsTableToolbarActionsProps {
  table: Table<Tool>
}

export function ToolsTableToolbarActions({ table }: ToolsTableToolbarActionsProps) {
  const { execute: processToolsAction, isPending } = useServerAction(processTools, {
    onSuccess: () => {
      toast.success("Tools processing started")
      table.toggleAllRowsSelected(false)
    },
    onError: ({ err }) => {
      toast.error(err.message)
    },
  })

  const selectedTools = table.getFilteredSelectedRowModel().rows.map(row => row.original)

  return (
    <>
      {selectedTools.length > 0 ? (
        <>
          <Button
            variant="outline"
            size="sm"
            prefix={<PlayIcon />}
            disabled={isPending}
            onClick={() => processToolsAction({ ids: selectedTools.map(t => t.id) })}
          >
            Process ({selectedTools.length})
          </Button>

          <ToolsScheduleDialog
            tools={selectedTools}
            onSuccess={() => table.toggleAllRowsSelected(false)}
          />

          <ToolsDeleteDialog
            tools={selectedTools}
            onSuccess={() => table.toggleAllRowsSelected(false)}
          />
        </>
      ) : null}
    </>
  )
}
