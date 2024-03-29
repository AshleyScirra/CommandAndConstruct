import { UnitMovementController } from "./unitMovementController.js";
import { UnitMovementState } from "./unitMovementState.js";
import * as MathUtils from "../../utils/mathUtils.js";
// UnitMovementStateRotateFirst manages the "rotate-first" state for UnitMovementController.
// The unit has been brought to a stop, and this state rotates it on-the-spot to face towards
// its first waypoint.
export class UnitMovementStateRotateFirst extends UnitMovementState {
    constructor(controller) {
        super(controller);
        // Set debug state 2 for "rotate-first"
        this.SetUnitDebugState(2);
    }
    Tick(dt) {
        const controller = this.GetController();
        const unitPlatform = this.GetUnitPlatform();
        const waypoints = this.GetWaypoints();
        // Get current position and first waypoint position.
        const [currentX, currentY] = unitPlatform.GetPosition();
        const [curTargetX, curTargetY] = waypoints[0];
        // Get current angle and the angle to the first waypoint.
        const currentAngle = unitPlatform.GetAngle();
        const targetAngle = MathUtils.AngleTo(currentX, currentY, curTargetX, curTargetY);
        // If the unit is facing in the right direction, proceed to the next move state.
        // Note a small angular difference is allowed in order to avoid floating point
        // precision errors counting as not being in the right direction.
        if (MathUtils.AngleDifference(targetAngle, currentAngle) < MathUtils.ToRadians(0.01)) {
            controller.SetNextState("moving");
        }
        else {
            // While not facing in the right direction, rotate towards the target angle.
            // Note this could cause the unit to collide with another one. If that happens,
            // then revert it back to the original angle and proceed to the next state anyway,
            // in the hope that moving forwards will allow it to drive around whatever blocked it.
            const startingPosition = unitPlatform.SavePosition();
            unitPlatform.SetAngle(MathUtils.AngleRotate(currentAngle, targetAngle, unitPlatform.GetRotateSpeed() * dt));
            if (unitPlatform.IntersectsAnyOther()) {
                unitPlatform.RestorePosition(startingPosition);
                controller.SetNextState("moving");
            }
        }
    }
}
