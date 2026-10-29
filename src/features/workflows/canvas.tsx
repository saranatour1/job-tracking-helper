import {
  type Branch,
  type Step,
  stepAt,
  type Trigger,
} from "@convex/api/features/automations/validators"
import {
  Delete02Icon,
  MinusSignIcon,
  PlusSignIcon,
  Maximize01Icon,
} from "@hugeicons/core-free-icons"
import { HugeiconsIcon } from "@hugeicons/react"
import {
  Background,
  BackgroundVariant,
  BaseEdge,
  type Edge,
  type EdgeProps,
  EdgeLabelRenderer,
  getBezierPath,
  Handle,
  type Node,
  type NodeProps,
  Panel,
  Position,
  ReactFlow,
  ReactFlowProvider,
  useReactFlow,
  useViewport,
} from "@xyflow/react"

import { EVENT_COLORS } from "@/components/kloq"
import { Button } from "@/components/ui/button"
import {
  Menu,
  MenuGroup,
  MenuGroupLabel,
  MenuItem,
  MenuPopup,
  MenuSeparator,
  MenuTrigger,
} from "@/components/ui/menu"
import { cn } from "@/lib/utils"

import { blockKinds, blocks, branches, summaryOf, triggerInfo } from "./blocks"
import { layout, sizes, type Slot } from "./tree"

export type StepStatus = "running" | "waiting" | "done" | "failed"
export type InsertKind = (typeof blockKinds)[number] | Branch["kind"]
const branchKinds = Object.keys(branches) as Branch["kind"][]

// Everything the cards and lines need, passed once rather than through every node.
type Actions = {
  selected?: string
  editable: boolean
  statuses: Record<string, StepStatus>
  onSelect: (at: string) => void
  onRemove: (at: string) => void
  onInsert: (slot: Slot, kind: InsertKind) => void
}
type CardData = Actions & {
  title: string
  summary: string
  icon: typeof Delete02Icon
  color?: string
}
// `count`: how often Jev took this path, on an Ask Jev step.
type LineData = Actions & { slot: Slot; label?: string; count?: number }

const statusDot: Record<StepStatus, string> = {
  running: "bg-info animate-pulse",
  waiting: "bg-warning",
  done: "bg-success",
  failed: "bg-destructive",
}

const handles = (
  <>
    <Handle
      type="target"
      position={Position.Top}
      className="!size-1 !min-w-0 !border-0 !bg-transparent"
    />
    <Handle
      type="source"
      position={Position.Bottom}
      className="!size-1 !min-w-0 !border-0 !bg-transparent"
    />
  </>
)

// A step's card: its icon, name, one line about it, and how its last run went.
const Card = ({ id, data }: NodeProps<Node<CardData>>) => {
  const status = data.statuses[id]
  const removable = id !== "trigger" && data.editable
  return (
    <div
      role="button"
      tabIndex={0}
      onKeyDown={(e) => e.key === "Enter" && data.onSelect(id)}
      style={{ width: sizes.width, height: sizes.height }}
      className={cn(
        "group bg-card text-card-foreground flex items-center gap-2.5 rounded-lg border px-2.5 shadow-xs/5 transition-colors duration-150",
        "hover:border-ring/40 cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-ring",
        data.selected === id && "border-ring ring-ring/30 ring-2",
        status === "failed" && "border-destructive/50"
      )}
    >
      {handles}
      <span
        className={cn(
          "flex size-7 shrink-0 items-center justify-center rounded-md",
          data.color ? EVENT_COLORS[data.color as keyof typeof EVENT_COLORS].tint : "bg-muted"
        )}
      >
        <HugeiconsIcon icon={data.icon} className="size-4" />
      </span>
      <span className="flex min-w-0 flex-1 flex-col">
        <span className="truncate text-[13px] leading-tight font-medium">{data.title}</span>
        <span className="text-muted-foreground truncate text-xs leading-tight">{data.summary}</span>
      </span>
      {status && <span className={cn("size-2 shrink-0 rounded-full", statusDot[status])} />}
      {removable && (
        <button
          type="button"
          aria-label={`Remove ${data.title}`}
          onClick={(e) => {
            e.stopPropagation()
            data.onRemove(id)
          }}
          className="text-muted-foreground hover:text-foreground -me-1 rounded-md p-1 opacity-0 transition-opacity group-hover:opacity-100 focus-visible:opacity-100"
        >
          <HugeiconsIcon icon={Delete02Icon} className="size-3.5" />
        </button>
      )}
    </div>
  )
}

// Where paths come back together; small, so the steps stay the focus.
const Join = () => <div className="bg-border size-2 rounded-full">{handles}</div>
const End = () => (
  <div className="text-muted-foreground bg-background rounded-full border px-2.5 py-0.5 text-xs">
    {handles}
    End
  </div>
)

// A dashed line with a + in the middle: pick a block, or drop one from the list.
const Line = (props: EdgeProps<Edge<LineData>>) => {
  const [path, x, y] = getBezierPath(props)
  const data = props.data!
  const topLevel = data.slot.split === undefined
  return (
    <>
      <BaseEdge
        path={path}
        style={{ strokeDasharray: "4 4" }}
        className="!stroke-muted-foreground/40"
      />
      <EdgeLabelRenderer>
        <div
          className="nodrag nopan pointer-events-auto absolute flex flex-col items-center gap-1"
          style={{ transform: `translate(-50%, -50%) translate(${x}px, ${y}px)` }}
        >
          {data.label && (
            <span className="bg-muted text-muted-foreground rounded-full px-2 py-0.5 text-[11px] font-medium">
              {data.label}
              {data.count !== undefined && (
                <span className="text-muted-foreground/70 ms-1 tabular-nums">{data.count}</span>
              )}
            </span>
          )}
          {data.editable && (
            <Menu>
              <MenuTrigger
                aria-label="Add a step here"
                onDragOver={(e) => e.preventDefault()}
                onDrop={(e) => {
                  const kind = e.dataTransfer.getData("text/workflow-block") as InsertKind
                  if (kind && (!(kind in branches) || topLevel)) data.onInsert(data.slot, kind)
                }}
                className="bg-background text-muted-foreground hover:text-foreground hover:border-ring/40 flex size-5 items-center justify-center rounded-full border transition-colors"
              >
                <HugeiconsIcon icon={PlusSignIcon} className="size-3" />
              </MenuTrigger>
              <MenuPopup className="min-w-48">
                <MenuGroup>
                  <MenuGroupLabel>Add a step</MenuGroupLabel>
                  {blockKinds.map((kind) => (
                    <MenuItem key={kind} onClick={() => data.onInsert(data.slot, kind)}>
                      <HugeiconsIcon icon={blocks[kind].icon} />
                      {blocks[kind].label}
                    </MenuItem>
                  ))}
                </MenuGroup>
                {topLevel && (
                  <>
                    <MenuSeparator />
                    {branchKinds.map((kind) => (
                      <MenuItem key={kind} onClick={() => data.onInsert(data.slot, kind)}>
                        <HugeiconsIcon icon={branches[kind].icon} />
                        {branches[kind].label}
                      </MenuItem>
                    ))}
                  </>
                )}
              </MenuPopup>
            </Menu>
          )}
        </div>
      </EdgeLabelRenderer>
    </>
  )
}

const nodeTypes = { card: Card, join: Join, end: End }
const edgeTypes = { line: Line }
const widths = { trigger: sizes.width, block: sizes.width, split: sizes.width, join: 8, end: 48 }

const ZoomBar = () => {
  const flow = useReactFlow()
  const { zoom } = useViewport()
  return (
    <Panel
      position="bottom-left"
      className="bg-card flex items-center gap-0.5 rounded-lg border p-0.5 shadow-xs/5"
    >
      <Button
        variant="ghost"
        size="icon-xs"
        aria-label="Zoom out"
        onClick={() => void flow.zoomOut()}
      >
        <HugeiconsIcon icon={MinusSignIcon} />
      </Button>
      <span className="text-muted-foreground w-10 text-center text-xs tabular-nums">
        {Math.round(zoom * 100)}%
      </span>
      <Button
        variant="ghost"
        size="icon-xs"
        aria-label="Zoom in"
        onClick={() => void flow.zoomIn()}
      >
        <HugeiconsIcon icon={PlusSignIcon} />
      </Button>
      <Button
        variant="ghost"
        size="icon-xs"
        aria-label="Fit to screen"
        onClick={() => void flow.fitView({ padding: 0.2 })}
      >
        <HugeiconsIcon icon={Maximize01Icon} />
      </Button>
    </Panel>
  )
}

// The workflow drawn top to bottom. Cards sit where the steps put them, so there's
// nothing to drag into place; lines carry the + for adding steps.
export const Canvas = ({
  trigger,
  steps,
  nameOf,
  choices,
  ...actions
}: Actions & {
  trigger: Trigger
  steps: Step[]
  nameOf: (id: string) => string | undefined
  // Jev's answers so far, by Ask Jev step then answer.
  choices?: Record<string, Record<string, number>>
}) => {
  const { nodes, edges } = layout(steps)
  const flowNodes: Node[] = nodes.map((n) => {
    const position = {
      x: n.x - widths[n.kind] / 2,
      y: n.kind === "join" ? n.y + sizes.height / 2 : n.y,
    }
    if (n.kind === "join") return { id: n.id, type: "join", position, data: {} }
    if (n.kind === "end") return { id: n.id, type: "end", position, data: {} }
    if (n.kind === "trigger") {
      const info = triggerInfo(trigger)
      return {
        id: n.id,
        type: "card",
        position,
        data: { ...actions, title: info.label, summary: info.summary, icon: info.icon },
      }
    }
    const step = stepAt(steps, n.id)!
    const info =
      step.kind === "parallel" || step.kind === "decide"
        ? { ...branches[step.kind], color: undefined, label: branches[step.kind].short }
        : blocks[step.kind]
    return {
      id: n.id,
      type: "card",
      position,
      data: {
        ...actions,
        title: info.label,
        summary: summaryOf(step, nameOf),
        icon: info.icon,
        color: info.color,
      },
    }
  })
  const flowEdges: Edge[] = edges.map((e) => ({
    id: e.id,
    source: e.from,
    target: e.to,
    type: "line",
    data: {
      ...actions,
      slot: e.slot,
      label: e.label,
      count:
        e.label && e.slot.split !== undefined
          ? choices?.[String(e.slot.split)]?.[e.label]
          : undefined,
    },
  }))
  return (
    <ReactFlowProvider>
      <ReactFlow
        // A new card can land off-screen, so the canvas fits itself again when cards come or go.
        key={flowNodes.length}
        nodes={flowNodes}
        edges={flowEdges}
        nodeTypes={nodeTypes}
        edgeTypes={edgeTypes}
        fitView
        fitViewOptions={{ padding: 0.2, maxZoom: 1 }}
        minZoom={0.3}
        maxZoom={1.5}
        // Also what lets the cards take clicks: React Flow makes nodes that do nothing inert.
        onNodeClick={(_, node) => node.type === "card" && actions.onSelect(node.id)}
        nodesDraggable={false}
        nodesConnectable={false}
        elementsSelectable={false}
        panOnScroll
        className="workflow-canvas"
      >
        <Background variant={BackgroundVariant.Dots} gap={16} size={1} />
        <ZoomBar />
      </ReactFlow>
    </ReactFlowProvider>
  )
}
