
import * as MathUtils from "../utils/clientMathUtils.js";

// If a pointerup comes within this distance of the corresponding pointerdown,
// it will be counted as a tap. Otherwise it will be counted as a drag.
const MAX_TAP_DIST = 30;

// This class holds extra state for tracking individual pointers in PointerManager.
export class PointerInfo {

	#pointerManager;
	
	#actionType = "tap";	// one of "tap", "drag" or "pan"
	#pointerType = "";		// one of "mouse", "touch", "pen"
	
	#startClientX = 0;		// start position in client co-ordinates
	#startClientY = 0;
	#lastClientX = 0;		// last position in client co-ordinates
	#lastClientY = 0;
	#startLayerX = 0;		// start position on background layer
	#startLayerY = 0;
	
	#selectionBoxInst;		// Construct instance for selection box
	
	constructor(pointerManager, e)
	{
		this.#pointerManager = pointerManager;
		this.#startClientX = e.clientX;
		this.#startClientY = e.clientY;
		this.#lastClientX = e.clientX;
		this.#lastClientY = e.clientY;
		this.#pointerType = e.pointerType;
		
		// Get the start position of this pointer on the background layer.
		// This allows the start position of a selection box to remain in place regardless
		// of scrolling and zooming.
		const runtime = this.GetRuntime();
		const backgroundLayer = runtime.layout.getLayer("Background");
		const [layerX, layerY] = backgroundLayer.cssPxToLayer(e.clientX, e.clientY);
		this.#startLayerX = layerX;
		this.#startLayerY = layerY;
		
		// Use the middle mouse button for pan scrolling.
		if (e.pointerType === "mouse" && e.button === 1)
		{
			this.#actionType = "pan";
			this.#pointerManager.StartPan();
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
	
	OnMove(e)
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
			this.#UpdateDrag(e.clientX, e.clientY);
		}
		else if (this.#actionType === "pan")
		{
			this.#UpdatePan(e);
		}
	}
	
	// When the zoom level changes, Update() is called, which is essentially treated as a pointermove
	// event but just re-using the last client position. This keeps the selection box updated while
	// the zoom level changes.
	Update()
	{
		if (this.#actionType === "drag")
		{
			this.#UpdateDrag(this.#lastClientX, this.#lastClientY);
		}
	}
	
	OnUp(e)
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
	#UpdateDrag(clientX, clientY)
	{
		// Get both the background and selection box layers.
		const runtime = this.GetRuntime();
		const backgroundLayer = runtime.layout.getLayer("Background");
		const dragSelectionBoxLayer = runtime.layout.getLayer("DragSelectionBox");
		
		// Translate the start position on the background layer on to the DragSelectionBox layer,
		// since this is where the drag selection box starts from.
		// This is done by converting the background layer position to client co-ordinates, and then
		// client co-ordinates to the DragSelectionBox layer.
		const [startClientX, startClientY] = backgroundLayer.layerToCssPx(this.#startLayerX, this.#startLayerY);
		const [startX, startY] = dragSelectionBoxLayer.cssPxToLayer(startClientX, startClientY);
		
		// Get the end position on the DragSelectionBox layer, which is the current pointer position.
		const [endX, endY] = dragSelectionBoxLayer.cssPxToLayer(clientX, clientY);
		
		// Set the drag selection box size and position from the maximum and minimum bounds of the
		// selection position on the DragSelectionBox layer.
		// This prevents any mirror/flip appearance if the pointer is dragged left or up.
		const minX = Math.min(startX, endX);
		const minY = Math.min(startY, endY);
		const maxX = Math.max(startX, endX);
		const maxY = Math.max(startY, endY);
		
		this.#selectionBoxInst.x = minX;
		this.#selectionBoxInst.y = minY;
		this.#selectionBoxInst.width = maxX - minX;
		this.#selectionBoxInst.height = maxY - minY;
	}
	
	// Called when the pointer is released during a drag.
	#EndDrag(e)
	{
		// Get the end position of the selection box on the background layer,
		// i.e. in the co-ordinate system of units.
		const runtime = this.GetRuntime();
		const backgroundLayer = runtime.layout.getLayer("Background");
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
		this.#selectionBoxInst.destroy();
	}
	
	#UpdatePan(e)
	{
		// Handle pan scrolling in PointerManager.
		// Pass it the distance this pointer has moved in client co-ordinates.
		this.#pointerManager.UpdatePan(e.clientX - this.#startClientX, e.clientY - this.#startClientY);
	}
}