import { UnitMovementController } from "./unitMovementController.js";
import { UnitMovementState } from "./unitMovementState.js";
import * as MathUtils from "../../utils/mathUtils.js";
// UnitMovementStateStopping manages the "stopping" state for UnitMovementController.
// This brings the unit to a halt and then proceeds to the "rotate-first" state.
export class UnitMovementStateStopping extends UnitMovementState {
    constructor(controller) {
        super(controller);
        // Set debug state 1 for "stopping"
        this.SetUnitDebugState(1);
    }
    Tick(dt) {
        const controller = this.GetController();
        const unitPlatform = this.GetUnitPlatform();
        const waypoints = this.GetWaypoints();
        const startingPosition = unitPlatform.SavePosition();
        // Step movement with a target speed of 0, which will decelerate it to a stop.
        controller.StepMovement(dt, 0);
        // See if it collided with anything. If so revert back to the original position
        // and bring the unit to an immediate stop, which will allow it to proceed directly
        // to the next state.
        const didCollide = unitPlatform.IntersectsAnyOther();
        if (didCollide) {
            unitPlatform.RestorePosition(startingPosition);
            unitPlatform.SetSpeed(0);
            this.GetUnit().MarkPositionDelta();
        }
        // Unit has come to a stop
        if (unitPlatform.GetSpeed() === 0) {
            // Stop any further acceleration
            unitPlatform.SetAcceleration(0);
            // If there is no path, then release the movement controller as there is
            // nothing else to do. (If a path is found the unit will create a new controller.)
            if (waypoints.length === 0) {
                controller.SetNextState("released");
            }
            else {
                // Otherwise a path has been found, so proceed to next move state.
                controller.SetNextState("rotate-first");
            }
        }
    }
}
