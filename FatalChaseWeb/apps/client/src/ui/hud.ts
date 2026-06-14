import type { CombatantState } from "@fatal-chase/shared";

export type TraumaNotice = {
  title: string;
  detail: string;
  tone: "danger" | "success" | "neutral";
};

const limbLabels: Array<[keyof CombatantState["limbs"], string]> = [
  ["head", "头"],
  ["torso", "身"],
  ["leftArm", "左臂"],
  ["rightArm", "右臂"],
  ["leftLeg", "左腿"],
  ["rightLeg", "右腿"]
];

export class Hud {
  private readonly root = document.createElement("div");
  private readonly limbs: HTMLDivElement;
  private readonly roll: HTMLSpanElement;
  private readonly parry: HTMLSpanElement;
  private readonly protection: HTMLSpanElement;
  private readonly score: HTMLSpanElement;
  private readonly charge: HTMLSpanElement;
  private readonly terrain: HTMLSpanElement;
  private readonly target: HTMLSpanElement;
  private readonly phase: HTMLDivElement;
  private readonly feed: HTMLDivElement;
  private readonly trauma: HTMLDivElement;

  constructor(host: HTMLElement) {
    this.root.className = "hud";
    this.root.innerHTML = `
      <div class="hud__brand">
        <strong>致命追击</strong>
        <span>LOCAL PROTOTYPE / SPRINT 2</span>
        <span>碎肉分 <b data-score>0</b></span>
      </div>
      <div class="hud__phase" data-phase>初期试探 01:00</div>
      <div class="hud__limbs">
        <div class="limb-grid"></div>
        <div class="hud__hint">肢体状态会影响移动和翻滚</div>
      </div>
      <div class="cooldowns">
        <div class="cooldown"><strong>翻滚</strong><span data-roll>READY</span></div>
        <div class="cooldown"><strong>截箭</strong><span data-parry>READY</span></div>
        <div class="cooldown"><strong>保护</strong><span data-protection>OFF</span></div>
        <div class="cooldown"><strong>蓄力</strong><span data-charge>0%</span></div>
        <div class="cooldown"><strong>地形</strong><span data-terrain>干地</span></div>
        <div class="cooldown"><strong>目标</strong><span data-target>靶子</span></div>
      </div>
      <div class="trauma trauma--hidden" data-trauma>
        <strong data-trauma-title></strong>
        <span data-trauma-detail></span>
      </div>
      <div class="event-feed" data-feed></div>
      <div class="hud__hint">WASD 移动 / 鼠标瞄准 / 空格翻滚 / E 截箭 / 左键蓄力 / 右键取消</div>
    `;
    this.limbs = this.root.querySelector(".limb-grid") as HTMLDivElement;
    this.roll = this.root.querySelector("[data-roll]") as HTMLSpanElement;
    this.parry = this.root.querySelector("[data-parry]") as HTMLSpanElement;
    this.protection = this.root.querySelector("[data-protection]") as HTMLSpanElement;
    this.score = this.root.querySelector("[data-score]") as HTMLSpanElement;
    this.charge = this.root.querySelector("[data-charge]") as HTMLSpanElement;
    this.terrain = this.root.querySelector("[data-terrain]") as HTMLSpanElement;
    this.target = this.root.querySelector("[data-target]") as HTMLSpanElement;
    this.phase = this.root.querySelector("[data-phase]") as HTMLDivElement;
    this.feed = this.root.querySelector("[data-feed]") as HTMLDivElement;
    this.trauma = this.root.querySelector("[data-trauma]") as HTMLDivElement;
    host.appendChild(this.root);
  }

  update(
    player: CombatantState,
    chargeRatio: number,
    terrain: string,
    events: string[],
    timeRemaining: number,
    targetName: string,
    trauma: TraumaNotice | null
  ): void {
    this.limbs.replaceChildren(
      ...limbLabels.map(([key, label]) => {
        const node = document.createElement("div");
        node.className = `limb limb--${player.limbs[key]}`;
        node.textContent = label;
        return node;
      })
    );
    this.roll.textContent = player.rollCooldown === 0 ? "READY" : `${player.rollCooldown.toFixed(1)}s`;
    this.parry.textContent =
      player.parrySeconds > 0 ? "ACTIVE" : player.parryCooldown === 0 ? "READY" : `${player.parryCooldown.toFixed(1)}s`;
    this.protection.textContent =
      player.protectionSeconds > 0 ? `${player.protectionSeconds.toFixed(1)}s` : "OFF";
    this.score.textContent = String(player.score);
    this.charge.textContent = `${Math.round(chargeRatio * 100)}%`;
    this.terrain.textContent = terrain;
    this.target.textContent = targetName;
    this.phase.textContent = `初期试探 ${formatTime(timeRemaining)}`;
    this.renderTrauma(trauma);
    this.feed.replaceChildren(
      ...events.slice(-4).map((event) => {
        const node = document.createElement("div");
        node.textContent = event;
        return node;
      })
    );
  }

  private renderTrauma(trauma: TraumaNotice | null): void {
    const title = this.trauma.querySelector("[data-trauma-title]") as HTMLElement;
    const detail = this.trauma.querySelector("[data-trauma-detail]") as HTMLElement;
    this.trauma.className = trauma ? `trauma trauma--${trauma.tone}` : "trauma trauma--hidden";
    title.textContent = trauma?.title ?? "";
    detail.textContent = trauma?.detail ?? "";
  }
}

const formatTime = (timeRemaining: number): string => {
  const seconds = Math.max(0, Math.ceil(timeRemaining));
  const minutes = Math.floor(seconds / 60);
  const rest = String(seconds % 60).padStart(2, "0");
  return `${minutes}:${rest}`;
};
