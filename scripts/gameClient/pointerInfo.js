
// This represents extra state for tracking pointers in SelectionManager.
// It's used like a struct or normal JavaScript object, so has public fields, but also
// adds some extra private fields and methods for handling selection boxes.
export class PointerInfo {

	// Public fields, directly used by SelectionManager
	clientX = 0;
	clientY = 0;
	isDrag = false;
	
	// Private fields
	#selectionManager;
	#startLayerX = 0;		// Start position on background layer
	#startLayerY = 0;
	#selectionBoxInst;		// Construct instance for selection box
	
	constructor(selectionManager, e)
	{
		this.#selectionManager = selectionManager;
		this.clientX = e.clientX;
		this.clientY = e.clientY;
		
		// Get the start position of this pointer on the background layer.
		// This allows the start position to remain in place regardless of scrolling and zooming.
		const runtime = this.#selectionManager.GetRuntime();
		const backgroundLayer = runtime.layout.getLayer("Background");
		const [layerX, layerY] = backgroundLayer.cssPxToLayer(e.clientX, e.clientY);
		this.#startLayerX = layerX;
		this.#startLayerY = layerY;
	}
	
	// Called when the pointer moves far enough to count as a drag.
	StartDrag()
	{
		this.isDrag = true;
		
		// Create a DragSElectionBox instance on the DragSelectionBox layer.
		// Note the position is 0,0 but it doesn't matter - when a drag starts it will immediately
		// be followed up with a call to UpdateDrag() which updates the size and position.
		const runtime = this.#selectionManager.GetRuntime();
		this.#selectionBoxInst = runtime.objects.DragSelectionBox.createInstance("DragSelectionBox", 0, 0);
	}
	
	// Called when the pointer moves during a drag.
	UpdateDrag(e)
	{
		// Get both the background and selection box layers.
		const runtime = this.#selectionManager.GetRuntime();
		const backgroundLayer = runtime.layout.getLayer("Background");
		const dragSelectionBoxLayer = runtime.layout.getLayer("DragSelectionBox");
		
		// Translate the start position on the background layer on to the DragSelectionBox layer,
		// since this is where the drag selection box starts from.
		// This is done by converting the background layer position to client co-ordinates, and then
		// client co-ordinates to the DragSelectionBox layer.
		const [startClientX, startClientY] = backgroundLayer.layerToCssPx(this.#startLayerX, this.#startLayerY);
		const [startX, startY] = dragSelectionBoxLayer.cssPxToLayer(startClientX, startClientY);
		
		// Get the end position on the DragSelectionBox layer, which is the current pointer position.
		const [endX, endY] = dragSelectionBoxLayer.cssPxToLayer(e.clientX, e.clientY);
		
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
	EndDrag(e)
	{
		// Get the end position of the selection box on the background layer,
		// i.e. in the co-ordinate system of units.
		const runtime = this.#selectionManager.GetRuntime();
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
			this.#selectionManager.UnselectAll();
		}
		
		this.#selectionManager.SelectAllInRectangle(minX, minY, maxX, maxY);
		
		// Destroy the selection box instance as it's no longer needed.
		this.#selectionBoxInst.destroy();
	}
}