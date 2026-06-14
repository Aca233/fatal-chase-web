type SettlementStats = {
  score: number;
  shots: number;
  hits: number;
  severed: number;
  fatalHits: number;
  boxesDestroyed: number;
  fakeCancels: number;
  events: string[];
};

export class SettlementOverlay {
  private readonly root = document.createElement("div");
  private readonly title: HTMLHeadingElement;
  private readonly subtitle: HTMLParagraphElement;
  private readonly stats: HTMLDivElement;
  private readonly feed: HTMLDivElement;

  constructor(host: HTMLElement, onRestart: () => void) {
    this.root.className = "settlement settlement--hidden";
    this.root.innerHTML = `
      <section class="settlement__panel" aria-label="本局战报">
        <p class="settlement__kicker">LOCAL MATCH REPORT</p>
        <h2 data-title>碎肉复盘</h2>
        <p data-subtitle></p>
        <div class="settlement__stats" data-stats></div>
        <div class="settlement__feed" data-feed></div>
        <button type="button" data-restart>再来一局</button>
      </section>
    `;
    this.title = this.root.querySelector("[data-title]") as HTMLHeadingElement;
    this.subtitle = this.root.querySelector("[data-subtitle]") as HTMLParagraphElement;
    this.stats = this.root.querySelector("[data-stats]") as HTMLDivElement;
    this.feed = this.root.querySelector("[data-feed]") as HTMLDivElement;
    const restart = this.root.querySelector("[data-restart]") as HTMLButtonElement;
    restart.addEventListener("click", onRestart);
    host.appendChild(this.root);
  }

  show(stats: SettlementStats): void {
    this.title.textContent = this.getTitle(stats);
    this.subtitle.textContent = `碎肉分 ${stats.score} / 命中 ${stats.hits} / 断肢 ${stats.severed}`;
    this.stats.replaceChildren(
      this.createStat("射出", String(stats.shots)),
      this.createStat("命中", String(stats.hits)),
      this.createStat("断肢", String(stats.severed)),
      this.createStat("致命", String(stats.fatalHits)),
      this.createStat("破箱", String(stats.boxesDestroyed)),
      this.createStat("假动作", String(stats.fakeCancels))
    );
    this.feed.replaceChildren(
      ...stats.events.slice(-5).map((event) => {
        const node = document.createElement("div");
        node.textContent = event;
        return node;
      })
    );
    this.root.classList.remove("settlement--hidden");
  }

  hide(): void {
    this.root.classList.add("settlement--hidden");
  }

  private createStat(label: string, value: string): HTMLDivElement {
    const node = document.createElement("div");
    node.className = "settlement__stat";
    node.innerHTML = `<span>${label}</span><strong>${value}</strong>`;
    return node;
  }

  private getTitle(stats: SettlementStats): string {
    if (stats.fatalHits >= 3) {
      return "刑场熟客";
    }
    if (stats.severed >= 4) {
      return "拆零件冠军";
    }
    if (stats.fakeCancels >= 3) {
      return "假动作诈骗犯";
    }
    if (stats.boxesDestroyed >= 2) {
      return "装修队恶霸";
    }
    if (stats.score <= 0) {
      return "热身都算不上";
    }
    return "合格追击者";
  }
}
