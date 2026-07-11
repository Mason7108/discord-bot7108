import { DndContext, KeyboardSensor, PointerSensor, closestCenter, useSensor, useSensors, type DragEndEvent } from "@dnd-kit/core";
import { SortableContext, arrayMove, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { GripVertical, ListPlus, Trash2 } from "lucide-react";
import type { ActivityQueueItem } from "../types/activity";
import { formatTime } from "../utils/time";
import { MediaThumb, SourceBadge } from "./MediaThumb";

type Props = {
  items: ActivityQueueItem[];
  canManage: boolean;
  canAdd: boolean;
  onReorder: (ids: string[]) => void;
  onRemove: (id: string) => void;
  onPlayNext: (id: string) => void;
};

function SortableRow({ item, index, canManage, canAdd, onRemove, onPlayNext }: {
  item: ActivityQueueItem;
  index: number;
  canManage: boolean;
  canAdd: boolean;
  onRemove: (id: string) => void;
  onPlayNext: (id: string) => void;
}) {
  const sortable = useSortable({ id: item.queueItemId, disabled: !canManage });
  return (
    <div
      ref={sortable.setNodeRef}
      style={{ transform: CSS.Transform.toString(sortable.transform), transition: sortable.transition }}
      className={`queue-row ${sortable.isDragging ? "queue-row-dragging" : ""}`}
    >
      <span className="queue-index">{index + 2}</span>
      <MediaThumb item={item} />
      <div className="media-copy">
        <strong>{item.title}</strong>
        <span>{item.creator}</span>
      </div>
      <SourceBadge source={item.source} metadataOnly={item.metadataOnly} />
      <span className="queue-duration">{formatTime(item.durationSeconds)}</span>
      <div className="queue-actions">
        {canAdd ? (
          <button className="icon-button" type="button" title="Play next" aria-label={`Play ${item.title} next`} onClick={() => onPlayNext(item.queueItemId)}>
            <ListPlus size={17} />
          </button>
        ) : null}
        {canAdd ? (
          <button className="icon-button danger-button" type="button" title="Remove" aria-label={`Remove ${item.title}`} onClick={() => onRemove(item.queueItemId)}>
            <Trash2 size={16} />
          </button>
        ) : null}
        <button
          className="drag-handle"
          type="button"
          aria-label={`Reorder ${item.title}`}
          title={canManage ? "Drag to reorder" : "Only the host can reorder"}
          disabled={!canManage}
          {...sortable.attributes}
          {...sortable.listeners}
        >
          <GripVertical size={18} />
        </button>
      </div>
    </div>
  );
}

export function QueueList({ items, canManage, canAdd, onReorder, onRemove, onPlayNext }: Props) {
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );
  function handleDragEnd(event: DragEndEvent) {
    if (!event.over || event.active.id === event.over.id) return;
    const oldIndex = items.findIndex((item) => item.queueItemId === event.active.id);
    const newIndex = items.findIndex((item) => item.queueItemId === event.over?.id);
    onReorder(arrayMove(items, oldIndex, newIndex).map((item) => item.queueItemId));
  }
  if (items.length === 0) {
    return <div className="empty-queue">The shared queue is empty.</div>;
  }
  return (
    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
      <SortableContext items={items.map((item) => item.queueItemId)} strategy={verticalListSortingStrategy}>
        <div className="queue-list">
          {items.map((item, index) => (
            <SortableRow key={item.queueItemId} item={item} index={index} canManage={canManage} canAdd={canAdd} onRemove={onRemove} onPlayNext={onPlayNext} />
          ))}
        </div>
      </SortableContext>
    </DndContext>
  );
}
