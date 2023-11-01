
import * as MathUtils from "../../utils/clientMathUtils.js";
import { PointerManager } from "./pointerManager.js";

// If a pointerup comes within this distance of the corresponding pointerdown,
// it will be counted as a tap. Otherwise it will be counted as a drag.
const MAX_TAP_DIST = 30;

// This class holds extra state for tracking individual pointers in PointerManager.
export class PointerInfo {

	#pointerManager;
	
	#actionType = "tap";	// one of "tap", "drag", "pan" or "pinch-zoom"
	#pointerType = "";		// one of "mouse", "touch", "pen"
	
	#startClientX = 0;		// start position in client co-ordinates
	#startClientY = 0;
	#lastClientX = 0;		// last position in client co-ordinates
	#lastClientY = 0;
	#startLayerX = 0;		// start position on background layer
	#startLayerY = 0;
	
	// Construct instance for selection box
	#selectionBoxInst: InstanceType.DragSelectionBox | null;
	
	constructor(pointerManager: PointerManager, e: PointerEvent)
	{
		this.#pointerManager = pointerManager;
		this.#startClientX = e.clientX;
		this.#startClientY = e.clientY;
		this.#lastClientX = e.clientX;
		this.#lastClientY = e.clientY;
		this.#pointerType = e.pointerType;
		this.#selectionBoxInst = null;
		
		// Get the start position of this pointer on the background layer.
		// This allows the start position of a selection box to remain in place regardless
		// of scrolling and zooming.
		const runtime = this.GetRuntime();
		const backgroundLayer = runtime.layout.getLayer("Background")!;
		const [layerX, layerY] = backgroundLayer.cssPxToLayer(e.clientX, e.clientY);
		this.#startLayerX = layerX;
		this.#startLayerY = layerY;
		
		// Use the middle mouse button for pan scrolling.
		if (e.pointerType === "mouse" && e.button === 1)
		{
			this.#StartPan();
		}
	}
	
	GetRuntime()
	{
		return this.#pointerManager.GetRuntime();
	}
	
	GetSelectionManager()
	{
		return this.#pointerManager.GetSelectionManager();
	}
	
	GetViewManager()
	{
		return this.#pointerManager.GetViewManager();
	}
	
	GetPointerType()
	{
		return this.#pointerType;
	}
	
	GetActionType()
	{
		return this.#actionType;
	}
	
	GetStartClientPosition()
	{
		return [this.#startClientX, this.#startClientY];
	}
	
	GetLastClientPosition()
	{
		return [this.#lastClientX, this.#lastClientY];
	}
	
	OnMove(e: PointerEvent)
	{
		// Save the last client position.
		this.#lastClientX = e.clientX;
		this.#lastClientY = e.clientY;
		
		// If this pointer has moved more than the maximum tap distance from its start position,
		// then treat it as a drag instead. This will create a selection box and mark it as a drag
		// so it's no longer treated as a tap in the pointerup event.
		if (this.#actionType === "tap" &&
			MathUtils.DistanceTo(this.#startClientX, this.#startClientY, e.clientX, e.clientY) > MAX_TAP_DIST)
		{
			this.#StartDrag();
		}
		
		// If this pointer is dragging, update it while it moves, so the selection box follows the movement.
		if (this.#actionType === "drag")
		{
			this.#UpdateDrag();
		}
		else if (this.#actionType === "pan")
		{
			this.#UpdatePan(e);
		}
		else if (this.#actionType === "pinch-zoom")
		{
			// Since pinch-to-zoom gestures typically involve two pointers, rather than handle the
			// gesture in each pointermove event, just flag that pinch zoom changed in PointerManager
			// which will then update it based on both pointers at the end of the tick.
			this.#pointerManager.SetPinchZoomChanged();
		}
	}
	
	// When the zoom level changes, Update() is called, which is essentially treated as a pointermove
	// event but just re-using the last client position. This keeps the selection box updated while
	// the zoom level changes.
	Update()
	{
		if (this.#actionType === "drag")
		{
			this.#UpdateDrag();
		}
	}
	
	OnUp(e: PointerEvent)
	{
		// If this pointer moved far enough to count as a drag, finish the drag and select
		// all units inside the dragged box.
		if (this.#actionType === "drag")
		{
			this.#EndDrag(e);
		}
		// Otherwise if this pointer never moved far enough to count as a drag, treat it as a tap.
		else if (this.#actionType === "tap")
		{
			// A button value of 0 means the left mouse button, or a non-mouse input
			// like a touch or a pen input.
			if (e.button === 0)
			{
				this.GetSelectionManager().OnTap_MainButton(e);
			}
			// A button value of 2 means the right mouse button.
			else if (e.pointerType === "mouse" && e.button === 2)
			{
				this.GetSelectionManager().OnTap_RightMouseButton();
			}
		}
		else if (this.#actionType === "pan")
		{
			this.#EndPan();
		}
	}
	
	// Cancel a pointer so it stops doing any action without applying the results of that action.
	Cancel()
	{
		// Destroy selection box if one was created for a drag
		if (this.#actionType === "drag")
		{
			this.#selectionBoxInst!.destroy();
			this.#selectionBoxInst = null;
		}
		
		// Revert to default "tap" state
		this.#actionType = "tap";
	}
	
	// Called when the pointer moves far enough to count as a drag.
	#StartDrag()
	{
		this.#actionType = "drag";
		
		// Create a DragSelectionBox instance on the DragSelectionBox layer.
		// Note the position is 0,0 but it doesn't matter - when a drag starts it will immediately
		// be followed up with a call to UpdateDrag() which updates the size and position.
		const runtime = this.GetRuntime();
		this.#selectionBoxInst = runtime.objects.DragSelectionBox.createInstance("DragSelectionBox", 0, 0);
	}
	
	// Called when the pointer moves during a drag.
	#UpdateDrag()
	{
		// Get both the background and selection box layers.
		const runtime = this.GetRuntime();
		const backgroundLayer = runtime.layout.getLayer("Background")!;
		const dragSelectionBoxLayer = runtime.layout.getLayer("DragSelectionBox")!;
		
		// Translate the start position on the background layer on to the DragSelectionBox layer,
		// since this is where the drag selection box starts from.
		// This is done by converting the background layer position to client co-ordinates, and then
		// client co-ordinates to the DragSelectionBox layer.
		const [startClientX, startClientY] = backgroundLayer.layerToCssPx(this.#startLayerX, this.#startLayerY);
		const [startX, startY] = dragSelectionBoxLayer.cssPxToLayer(startClientX, startClientY);
		
		// Get the end position on the DragSelectionBox layer, which is the current pointer position.
		const [endX, endY] = dragSelectionBoxLayer.cssPxToLayer(this.#lastClientX, this.#lastClientY);
		
		// Set the drag selection box size and position from the maximum and minimum bounds of the
		// selection position on the DragSelectionBox layer.
		// This prevents any mirror/flip appearance if the pointer is dragged left or up.
		const minX = Math.min(startX, endX);
		const minY = Math.min(startY, endY);
		const maxX = Math.max(startX, endX);
		const maxY = Math.max(startY, endY);
		
		const selectionBoxInst = this.#selectionBoxInst!;
		selectionBoxInst.x = minX;
		selectionBoxInst.y = minY;
		selectionBoxInst.width = maxX - minX;
		selectionBoxInst.height = maxY - minY;
	}
	
	// For a dragging pointer, return the selection box area in game layer co-ordinates.
	// This is used for the minimap. Note this is not the same as the selection box object's
	// area, as that is in UI co-ordinates on the DragSelectionBox layer.
	GetSelectionBoxArea()
	{
		const runtime = this.GetRuntime();
		const backgroundLayer = runtime.layout.getLayer("Background")!;
		
		// Get start and end positions in layer co-ordinates
		const startX = this.#startLayerX;
		const startY = this.#startLayerY;
		const [endX, endY] = backgroundLayer.cssPxToLayer(this.#lastClientX, this.#lastClientY);
		
		// Normalize to the minimum and maximum bounds
		const minX = Math.min(startX, endX);
		const minY = Math.min(startY, endY);
		const maxX = Math.max(startX, endX);
		const maxY = Math.max(startY, endY);
		
		// Return as [left, top, width, height] as that is how the minimap draws things
		return [minX, minY, maxX - minX, maxY - minY];
	}
	
	// Called when the pointer is released during a drag.
	#EndDrag(e: PointerEvent)
	{
		// Get the end position of the selection box on the background layer,
		// i.e. in the co-ordinate system of units.
		const runtime = this.GetRuntime();
		const backgroundLayer = runtime.layout.getLayer("Background")!;
		const [endLayerX, endLayerY] = backgroundLayer.cssPxToLayer(e.clientX, e.clientY);
		
		// Find the bounds of the selection area on the background layer, using the maximum
		// and minimum bounds to ensure the rectangular area is normalized (i.e. with a positive
		// width and height regardless of the direction of the drag).
		const minX = Math.min(this.#startLayerX, endLayerX);
		const minY = Math.min(this.#startLayerY, endLayerY);
		const maxX = Math.max(this.#startLayerX, endLayerX);
		const maxY = Math.max(this.#startLayerY, endLayerY);
		
		// Select all units in this rectangle. However when not using mouse input,
		// unselect all units first, so only units in the selection box are selected.
		// Since non-mouse input can't right click, this means dragging a selection box
		// over an empty area can be used to unselect units if the player changes their mind.
		if (e.pointerType !== "mouse")
		{
			this.GetSelectionManager().UnselectAll();
		}
		
		this.GetSelectionManager().SelectAllInRectangle(minX, minY, maxX, maxY);
		
		// Destroy the selection box instance as it's no longer needed.
		this.#selectionBoxInst!.destroy();
	}
	
	#StartPan()
	{
		this.#actionType = "pan";
		this.GetViewManager().StartPan();
		this.#pointerManager.SetMouseCursor("move");		// show move cursor
	}
	
	#UpdatePan(e: PointerEvent)
	{
		// Handle pan scrolling in ViewManager.
		// Pass it where the pointer currently is in client co-ordinates.
		// It will scroll based on the movement since the last call to UpdatePan().
		this.GetViewManager().UpdatePan(e.clientX, e.clientY);
	}
	
	#EndPan()
	{
		this.#pointerManager.SetMouseCursor("auto");		// restore default cursor
	}
	
	// Called for both pointers when there are two simultaneous touch pointers.
	// These start a pinch-to-zoom gesture together.
	StartPinchZoom()
	{
		// Cancel any prior pointer action, such as dragging a selection box.
		this.Cancel();
		
		// Mark pointer action as being pinch-to-zoom.
		this.#actionType = "pinch-zoom";
		
		// Reset the start client position. This is because if a single touch pointer is dragged
		// some distance before a second touch pointer is started, the existing touch pointer
		// should pinch-to-zoom from its current position when the second touch pointer starts,
		// rather than where it originally started.
		this.#startClientX = this.#lastClientX;
		this.#startClientY = this.#lastClientY;
	}
	
	// Called every tick for any pointers that need to change over time, such as scrolling
	// when a drag pointer moves to the edge of the screen.
	Tick(dt: number)
	{
		if (this.#actionType === "drag")
		{
			this.#TickDragPointer(dt);
		}
	}
	
	// If a pointer moves all the way to the edge of the viewport while it is dragging a selection box,
	// scroll the view in the direction of the viewport side the pointer is against.
	// This lets the player select more content than is visible on-screen.
	#TickDragPointer(dt: number)
	{
		const runtime = this.GetRuntime();
		const viewManager = this.GetViewManager();
		const backgroundLayer = runtime.layout.getLayer("Background")!;
		
		// Get the pointer's last position on the background layer.
		const [layerX, layerY] = backgroundLayer.cssPxToLayer(this.#lastClientX, this.#lastClientY);
		
		// Get the current viewport rectangle, as the "edge of viewport" calculation
		// is done in layer co-ordinates. Also get the zoom level as it affects the scrolling.
		const [vpLeft, vpTop, vpRight, vpBottom] = viewManager.GetScaledViewportArea();
		const zoom = viewManager.GetZoom();
		
		// The scroll speed when dragging at the edge of the viewport is 800px/s, but it needs to be
		// scaled according to the zoom level (since for example that speed is too slow when zoomed out).
		const scrollSpeed = 800;
		const scaledScrollSpeed = scrollSpeed / zoom;
		
		// Allow a small margin inwards from the edge of the viewport for detecting a pointer at the edge.
		// This too must be scaled according to the zoom level to work consistently.
		const margin = 30;
		const scaledMargin = margin / zoom;

		// For each edge of the viewport, if the pointer is near that edge, scroll in that direction.
		// Also update the pointer if scrolling is done, as the start position of the selection box
		// must be updated if the scroll position changes.
		if (layerX <= vpLeft + scaledMargin)
		{
			viewManager.OffsetScroll(-scaledScrollSpeed * dt, 0);
			this.Update();
		}
		
		if (layerY <= vpTop + scaledMargin)
		{
			viewManager.OffsetScroll(0, -scaledScrollSpeed * dt);
			this.Update();
		}
		
		if (layerX >= vpRight - scaledMargin)
		{
			viewManager.OffsetScroll(scaledScrollSpeed * dt, 0);
			this.Update();
		}
		
		if (layerY >= vpBottom - scaledMargin)
		{
			viewManager.OffsetScroll(0, scaledScrollSpeed * dt);
			this.Update();
		}
	}
}