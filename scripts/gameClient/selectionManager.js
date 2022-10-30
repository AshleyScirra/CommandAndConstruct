
import { MultiEventHandler } from "../utils/multiEventHandler.js";
import { PointerInfo } from "./pointerInfo.js";
import * as MathUtils from "../utils/clientMathUtils.js";

// If a pointerup comes within this distance of the corresponding pointerdown,
// it will be counted as a tap. Otherwise it will be counted as a drag.
const MAX_TAP_DIST = 10;

// The SelectionManager class manages selecting units.
// It has its own class to avoid cluttering GameClient and organise
// as much of the relevant code as possible in a single place.
export class SelectionManager {

	// Private fields
	#gameClient;						// Reference to GameClient
	#selectedUnits = new Set();			// Set of all currently selected units
	#eventHandlers;						// MultiEventHandler for selection events
	#pointerInfos = new Map();			// map of pointer id -> PointerInfo
	
	constructor(gameClient)
	{
		this.#gameClient = gameClient;
		
		const runtime = this.#gameClient.GetRuntime();
		
		this.#eventHandlers = new MultiEventHandler([
			[runtime,		"pointerdown",		e => this.#OnPointerDown(e)],
			[runtime,		"pointermove",		e => this.#OnPointerMove(e)],
			[runtime,		"pointerup",		e => this.#OnPointerUp(e)]
		]);
	}
	
	Release()
	{
		this.#eventHandlers.Release();
	}
	
	GetRuntime()
	{
		return this.#gameClient.GetRuntime();
	}
	
	IsSelected(unit)
	{
		return this.#selectedUnits.has(unit);
	}
	
	IsAnyUnitSelected()
	{
		return this.#selectedUnits.size > 0;
	}
	
	// Set a given unit selected or unselected.
	SetSelected(unit, isSelected)
	{
		if (isSelected)		// setting selected
		{
			if (this.IsSelected(unit))
				return;		// already selected

			// Add this unit to the set of selected units,
			// and put the unit in a selected state to make this state visible.
			this.#selectedUnits.add(unit);
			unit.SetSelectedState(true);
		}
		else				// setting not selected
		{
			if (!this.IsSelected(unit))
				return;		// already not selected

			// Do the reverse: remove the unit from the set of selected units
			// and revert the unit back to an unselected state.
			this.#selectedUnits.delete(unit);
			unit.SetSelectedState(false);
		}
	}
	
	// Unselect all units at once. This is the same as calling
	// SetSelected(unit, false) on every selected unit.
	UnselectAll()
	{
		// Unset the selected state of all selected units.
		for (const unit of this.#selectedUnits)
		{
			unit.SetSelectedState(false);
		}
		
		// Clear the entire selected units set.
		this.#selectedUnits.clear();
	}
	
	#OnPointerDown(e)
	{
		if (this.#pointerInfos.has(e))
			return;		// ignore if already got this pointer ID
		
		// Save the start position of this pointer. Most pointer inputs aren't interpreted until
		// the pointerup event, to distinguish between taps and drags.
		this.#pointerInfos.set(e.pointerId, new PointerInfo(e.clientX, e.clientY));
	}
	
	#OnPointerMove(e)
	{
		const pointerInfo = this.#pointerInfos.get(e.pointerId);
		if (!pointerInfo)
			return;		// unknown pointer id, ignore
		
		// If this pointer has moved more than the maximum tap distance from its start position,
		// then flag it as a dragging pointer instead.
		if (!pointerInfo.isDrag &&
			MathUtils.DistanceTo(pointerInfo.clientX, pointerInfo.clientY, e.clientX, e.clientY) > MAX_TAP_DIST)
		{
			pointerInfo.isDrag = true;
		}
	}
	
	#OnPointerUp(e)
	{
		const pointerInfo = this.#pointerInfos.get(e.pointerId);
		if (!pointerInfo)
			return;		// unknown pointer id, ignore
		
		// If this pointer never moved far enough to count as a drag, treat it as a tap.
		if (!pointerInfo.isDrag)
		{
			// A button value of 0 means the left mouse button, or a non-mouse input
			// like a touch or a pen input.
			if (e.button === 0)
			{
				this.#OnTap_MainButton(e);
			}
			// A button value of 2 means the right mouse button.
			else if (e.pointerType === "mouse" && e.button === 2)
			{
				this.#OnTap_RightMouseButton();
			}
		}
		
		// Delete the pointer id from the start position map as the pointer is no longer in use.
		this.#pointerInfos.delete(e.pointerId);
	}
	
	#OnTap_MainButton(e)
	{
		// Determine the position of the pointer on the UnitPlatforms layer.
		const runtime = this.GetRuntime();
		const unitPlatformsLayer = runtime.layout.getLayer("UnitPlatforms");
		const [ layerX, layerY ] = unitPlatformsLayer.cssPxToLayer(e.clientX, e.clientY);
		
		// Clicking a unit directly should select it, but clicking elsewhere
		// on the ground should command any selected units to move there.
		// Track whether the pointer down hit any unit at all.
		let didHitUnit = false;
		
		// Check every one of the local player's units to see which is at this position (if any).
		// This stops the player being able to select other player's units. Note the server
		// verifies commands so even a hacked client that selects other player's units will
		// not be able to affect them.
		for (const unit of this.#gameClient.allLocalPlayerUnits())
		{
			// Found a unit that the pointer down hit.
			if (unit.ContainsPoint(layerX, layerY))
			{
				// Flag that a unit was hit.
				didHitUnit = true;
				
				// If the hit unit is already selected, skip it.
				// This allows checking if another unselected unit
				// is at this position.
				if (this.IsSelected(unit))
				{
					continue;
				}
				else
				{
					// Hit an unselected unit: make it selected.
					// Note that we also break out of the for loop so only one unit
					// can be selected per pointerdown event.
					this.SetSelected(unit, true);
					break;
				}
			}
		}
		
		// If the player has at least one unit selected and they click somewhere
		// on open ground (not over another unit), command the selected units
		// to move there. This instruction is handled by GameClient.
		if (this.IsAnyUnitSelected() && !didHitUnit)
		{
			this.#gameClient.MoveUnits([...this.#selectedUnits], layerX, layerY);
			
			// If the player is not using mouse input (e.g. touch input), they may be
			// unable to use right-click to unselect units. So automatically unselect
			// all units after issuing a move command so another unit can be selected.
			if (e.pointerType !== "mouse")
				this.UnselectAll();
		}
	}
	
	#OnTap_RightMouseButton()
	{
		// Unselect all units when pressing the right mouse button.
		// This can't be used via touch input, so instead when commanding units to move
		// via touch input, all selected units are automatically unselected.
		this.UnselectAll();
	}
}