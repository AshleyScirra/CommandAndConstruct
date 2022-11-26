
import { MultiEventHandler } from "../utils/multiEventHandler.js";
import { PointerInfo } from "./pointerInfo.js";
import * as MathUtils from "../utils/clientMathUtils.js";

// PointerManager tracks pointers and decides how to interpret actions based on them.
// A pointer is any kind of mouse, touch or pen input.
export class PointerManager {

	// Private fields
	#gameClient;						// Reference to GameClient
	#eventHandlers;						// MultiEventHandler for selection events
	#pointerInfos = new Map();			// map of pointer id -> PointerInfo
	
	// For tracking the last mouse position
	#lastMouseX = 0;
	#lastMouseY = 0;
	
	// For pinch-to-zoom
	#didPinchZoomChange = false;		// set to true when any pinch-to-zoom pointer moves
	#pinchStartZoom = 0;				// zoom level at the start of the pinch-to-zoom gesture
	
	constructor(gameClient)
	{
		this.#gameClient = gameClient;
		
		const runtime = this.#gameClient.GetRuntime();
		
		// Handle all kinds of pointer events.
		this.#eventHandlers = new MultiEventHandler([
			[runtime,		"pointerdown",		e => this.#OnPointerDown(e)],
			[runtime,		"pointermove",		e => this.#OnPointerMove(e)],
			[runtime,		"pointerup",		e => this.#OnPointerUp(e)],
			[runtime,		"wheel",			e => this.#OnMouseWheel(e)]
		]);
	}
	
	Release()
	{
		this.#eventHandlers.Release();
	}
	
	GetGameClient()
	{
		return this.#gameClient;
	}
	
	GetRuntime()
	{
		return this.#gameClient.GetRuntime();
	}
	
	GetSelectionManager()
	{
		return this.#gameClient.GetSelectionManager();
	}
	
	GetViewManager()
	{
		return this.#gameClient.GetViewManager();
	}
	
	#OnPointerDown(e)
	{
		if (this.#pointerInfos.has(e))
			return;		// ignore if already got this pointer ID
		
		// Create a PointerInfo to track the state of this pointer over time.
		const pointerInfo = new PointerInfo(this, e);
		
		// Check if there are now two touch pointers that could be used for pinch-to-zoom.
		if (e.pointerType === "touch")
			this.#MaybeStartPinchToZoom(pointerInfo);
		
		// Add this pointer to the map of all pointers by their pointer ID.
		this.#pointerInfos.set(e.pointerId, pointerInfo);
	}
	
	#OnPointerMove(e)
	{
		// If this pointer is the mouse, track the last mouse position in client co-ordinates.
		if (e.pointerType === "mouse")
		{
			this.#lastMouseX = e.clientX;
			this.#lastMouseY = e.clientY;
		}
		
		const pointerInfo = this.#pointerInfos.get(e.pointerId);
		if (!pointerInfo)
			return;		// unknown pointer id, ignore
		
		pointerInfo.OnMove(e);
	}
	
	#OnPointerUp(e)
	{
		const pointerInfo = this.#pointerInfos.get(e.pointerId);
		if (!pointerInfo)
			return;		// unknown pointer id, ignore
		
		pointerInfo.OnUp(e);
		
		// Delete the pointer id from the start position map as the pointer is no longer in use.
		this.#pointerInfos.delete(e.pointerId);
		
		// If this pointer was for pinch-to-zoom, there could be one remaining pinch-to-zoom
		// pointer that is used for pan scrolling only. To avoid the scroll position jumping
		// due to the old mid-point being somewhere else, restart the pan.
		if (pointerInfo.GetActionType() === "pinch-zoom")
			this.GetViewManager().StartPan();
	}
	
	// Calls Update() on every active PointerInfo to adapt to any changes.
	UpdateAllPointers()
	{
		for (const pointerInfo of this.#pointerInfos.values())
		{
			pointerInfo.Update();
		}
	}
	
	// Use the mouse wheel to zoom.
	#OnMouseWheel(e)
	{
		// Use the wheel deltaY amount in the zoom factor calculation. On one system deltaY
		// was +/- 200, so this calculation gives a zoom factor of 1.2 per step which feels
		// about right, and that should scale according to the device/system settings.
		const zoomFactor = 1 + (Math.abs(e.deltaY) / 1000);
		
		// Use the mouse position as the position to zoom in to/out from.
		const viewManager = this.GetViewManager();
		viewManager.SetZoomToPosition(this.#lastMouseX, this.#lastMouseY);
		
		// Set the zoom level in ViewManager.
		if (e.deltaY < 0)
			viewManager.SetZoom(viewManager.GetZoom() * zoomFactor);
		else
			viewManager.SetZoom(viewManager.GetZoom() / zoomFactor);
	}
	
	// Set the current mouse cursor style.
	SetMouseCursor(cursor)
	{
		this.GetRuntime().mouse.setCursorStyle(cursor);
	}
	
	// Get the current mouse position in game layer co-ordinates.
	GetMousePositionInLayout()
	{
		const backgroundLayer = this.GetRuntime().layout.getLayer("Background");
		return backgroundLayer.cssPxToLayer(this.#lastMouseX, this.#lastMouseY);
	}
	
	// Iterates all pointers used for dragging a selection box.
	// Used by the minimap to render selection boxes on the minimap.
	*dragPointers()
	{
		for (const pointerInfo of this.#pointerInfos.values())
		{
			if (pointerInfo.GetActionType() === "drag")
				yield pointerInfo;
		}
	}
	
	Tick(dt)
	{
		// Tick all pointers in case they change anything over time (like scrolling
		// when dragging a selection box to the edge of the screen).
		for (const pointerInfo of this.#pointerInfos.values())
		{
			pointerInfo.Tick(dt);
		}
		
		// If a pinch-to-zoom pointer changed in the past tick, call #UpdatePinchZoom().
		// This handles both pinch-to-zoom pointers at the same time.
		if (this.#didPinchZoomChange)
		{
			this.#UpdatePinchZoom();
			this.#didPinchZoomChange = false;
		}
	}
	
	// Called when a new touch pointer starts to check if a pinch-to-zoom gesture should start.
	// The new touch pointer should be the second touch pointer, and there must not already be
	// a pinch-to-zoom already happening with other touch pointers.
	#MaybeStartPinchToZoom(newPointer)
	{
		let otherPointer = null;			// other existing pointer to pinch-to-zoom with
		let numPinchZoomPointers = 0;		// count of any existing pinch-to-zoom pointers
		
		// Check all existing pointers. Note this does not yet include the new pointer.
		for (const existingPointer of this.#pointerInfos.values())
		{
			if (existingPointer.GetPointerType() !== "touch")
				continue;		// ignore non-touch pointers
			
			// Count how many existing pinch-to-zoom pointers there are.
			// If there are already 2, then don't allow any new pinch-to-zoom gesture to start.
			if (existingPointer.GetActionType() === "pinch-zoom")
			{
				numPinchZoomPointers++;
				
				if (numPinchZoomPointers >= 2)
					return;
			}
			
			// Otherwise use this touch pointer for the pinch-to-zoom gesture.
			otherPointer = existingPointer;
		};
		
		// If there is another touch pointer that can be used for pinch-to-zoom, start the gesture.
		// Note the other pointer can be in any state, including dragging, or a leftover single
		// pointer in pinch-to-zoom mode (which is used for panning only, but can be restarted as
		// a two-pointer pinch-to-zoom with a new touch pointer).
		if (otherPointer)
		{
			// Save the zoom level at the start of the pinch-to-zoom gesture, and start a new
			// pan as the gesture can also scroll the view.
			const viewManager = this.GetViewManager();
			this.#pinchStartZoom = viewManager.GetZoom();
			viewManager.StartPan();
			
			// Start pinch-to-zoom with both touch pointers.
			newPointer.StartPinchZoom();
			otherPointer.StartPinchZoom();
		}
	}
	
	// Called when any pinch-to-zoom pointer moves. This just sets a flag to call #UpdatePinchZoom()
	// at the end of the tick, since that can handle both pointers at once, rather than one at a time.
	SetPinchZoomChanged()
	{
		this.#didPinchZoomChange = true;
	}
	
	// When one or both pinch-to-zoom pointers move, this is called to update the zoom level
	// and scroll position accordingly.
	#UpdatePinchZoom()
	{
		// Of all active pointers, find the ones in pinch-to-zoom mode.
		const pinchZoomPointers = [...this.#pointerInfos.values()]
									.filter(pi => pi.GetActionType() === "pinch-zoom");
		
		// If there is only one pointer in pinch-to-zoom mode, keep using it for scrolling
		// the view only, but not zooming. This means if the user starts a pinch-to-zoom with
		// two touches, then removes only one touch, the remaining touch can be used to
		// keep scrolling; adding a second touch will then restore full pinch-to-zoom again.
		if (pinchZoomPointers.length === 1)
		{
			this.#UpdatePinchZoom_1Pointer(pinchZoomPointers[0]);
		}
		// With two pinch-to-zoom pointers handle both scrolling and zooming based on
		// the distance between the two pointers.
		else if (pinchZoomPointers.length === 2)
		{
			this.#UpdatePinchZoom_2Pointers(pinchZoomPointers[0], pinchZoomPointers[1]);
		}
	}
	
	#UpdatePinchZoom_1Pointer(pointerInfo)
	{
		// Using just one pinch-to-zoom pointer keeps scrolling the view.
		const [curX, curY] = pointerInfo.GetLastClientPosition();
		this.GetViewManager().UpdatePan(curX, curY);
	}
	
	#UpdatePinchZoom_2Pointers(pointer0, pointer1)
	{
		const viewManager = this.GetViewManager();
		
		// Get both the start position and current position of both pointers.
		const [p0startX, p0startY] = pointer0.GetStartClientPosition();
		const [p1startX, p1startY] = pointer1.GetStartClientPosition();
		const [p0curX, p0curY] = pointer0.GetLastClientPosition();
		const [p1curX, p1curY] = pointer1.GetLastClientPosition();
		
		// Find the current mid-point of the two pointers. Use this position for scrolling.
		const curMidX = (p0curX + p1curX) / 2;
		const curMidY = (p0curY + p1curY) / 2;
		viewManager.UpdatePan(curMidX, curMidY);
		
		// Also use the current mid-point as the zoom position, so zooming happens relative
		// to that position the same way it does with mouse wheel zooming.
		viewManager.SetZoomToPosition(curMidX, curMidY);
		
		// Find the original distance between the two pointers, and the current distance.
		// Zoom the view according to the change in distance.
		const startDist = MathUtils.DistanceTo(p0startX, p0startY, p1startX, p1startY);
		const curDist = MathUtils.DistanceTo(p0curX, p0curY, p1curX, p1curY);
		viewManager.SetZoom(this.#pinchStartZoom * (curDist / startDist));
	}
}