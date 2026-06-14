import type { InputCommand, Vec2 } from "@fatal-chase/shared";
import { normalize } from "@fatal-chase/shared";

const trackedKeys = new Set(["KeyW", "KeyA", "KeyS", "KeyD", "Space", "KeyE"]);

export class InputController {
  private readonly keys = new Set<string>();
  private readonly pointer: Vec2 = { x: 0, y: 0 };
  private charging = false;
  private fireQueued = false;
  private cancelCharge = false;
  private rollQueued = false;
  private parryQueued = false;

  constructor(private readonly target: HTMLElement) {
    window.addEventListener("keydown", this.onKeyDown);
    window.addEventListener("keyup", this.onKeyUp);
    window.addEventListener("pointermove", this.onPointerMove);
    window.addEventListener("pointerdown", this.onPointerDown);
    window.addEventListener("pointerup", this.onPointerUp);
    window.addEventListener("contextmenu", (event) => event.preventDefault());
  }

  read(): InputCommand {
    const move = normalize({
      x: Number(this.keys.has("KeyD")) - Number(this.keys.has("KeyA")),
      y: Number(this.keys.has("KeyS")) - Number(this.keys.has("KeyW"))
    });

    const command: InputCommand = {
      move,
      aim: { ...this.pointer },
      charging: this.charging,
      fire: this.fireQueued,
      cancelCharge: this.cancelCharge,
      roll: this.rollQueued,
      parry: this.parryQueued
    };

    this.cancelCharge = false;
    this.fireQueued = false;
    this.rollQueued = false;
    this.parryQueued = false;
    return command;
  }

  destroy(): void {
    window.removeEventListener("keydown", this.onKeyDown);
    window.removeEventListener("keyup", this.onKeyUp);
    window.removeEventListener("pointermove", this.onPointerMove);
    window.removeEventListener("pointerdown", this.onPointerDown);
    window.removeEventListener("pointerup", this.onPointerUp);
  }

  private readonly onKeyDown = (event: KeyboardEvent): void => {
    if (!trackedKeys.has(event.code)) {
      return;
    }
    event.preventDefault();
    const wasDown = this.keys.has(event.code);
    this.keys.add(event.code);
    if (event.repeat || wasDown) {
      return;
    }
    if (event.code === "Space") {
      this.rollQueued = true;
    }
    if (event.code === "KeyE") {
      this.parryQueued = true;
    }
  };

  private readonly onKeyUp = (event: KeyboardEvent): void => {
    this.keys.delete(event.code);
  };

  private readonly onPointerMove = (event: PointerEvent): void => {
    const bounds = this.target.getBoundingClientRect();
    this.pointer.x = event.clientX - bounds.left;
    this.pointer.y = event.clientY - bounds.top;
  };

  private readonly onPointerDown = (event: PointerEvent): void => {
    if (event.button === 0) {
      this.charging = true;
    }
    if (event.button === 2 && this.charging) {
      this.charging = false;
      this.cancelCharge = true;
    }
  };

  private readonly onPointerUp = (event: PointerEvent): void => {
    if (event.button === 0 && this.charging) {
      this.charging = false;
      this.fireQueued = true;
    }
  };
}
