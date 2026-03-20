import {
  Injectable,
  BadRequestException,
  ServiceUnavailableException,
  Logger
} from "@nestjs/common";
import axios from "axios";
import { DockerService } from "../docker/docker.service";

type CommandAction =
  | "list_containers"
  | "stop_container"
  | "start_container"
  | "restart_container"
  | "get_logs"
  | "unknown";

interface ParsedCommand {
  action: CommandAction;
  target: string | null;
  scope: "single" | "all";
  tail: number;
}

interface ContainerSummary {
  id: string;
  names: string[];
  image: string;
  state: string;
  status: string;
}

@Injectable()
export class AiService {
  private readonly logger = new Logger(AiService.name);
  private readonly ollamaBaseUrl =
    process.env.OLLAMA_BASE_URL || "http://localhost:11434";
  private readonly model = process.env.OLLAMA_MODEL || "qwen3:0.6b";

  constructor(private readonly dockerService: DockerService) {}

  async chat(prompt: string) {
    const cleanedPrompt = this.validatePrompt(prompt);

    try {
      return await this.generateText(cleanedPrompt);
    } catch (error: any) {
      throw new ServiceUnavailableException(
        `AI service unavailable: ${error?.message || "unknown error"}`
      );
    }
  }

  async handleCommand(prompt: string, confirm = false) {
    const cleanedPrompt = this.validatePrompt(prompt);
    const parsed = await this.parseCommand(cleanedPrompt);

    if (parsed.action === "unknown") {
      return {
        needsConfirmation: false,
        mode: "clarify",
        parsed,
        summary:
          "暂时只支持容器列表、启动、停止、重启和查看日志，请明确说明容器名。"
      };
    }

    if (parsed.action === "list_containers") {
      const containers = await this.dockerService.listContainers(true);
      return {
        needsConfirmation: false,
        mode: "executed",
        parsed,
        summary: `已获取 ${containers.length} 个容器`,
        result: {
          containers: containers.map((item: any) => this.toContainerSummary(item))
        }
      };
    }

    if (parsed.scope === "all") {
      return this.handleAllContainerCommand(parsed, confirm);
    }

    if (!parsed.target) {
      return {
        needsConfirmation: false,
        mode: "clarify",
        parsed,
        summary: "请补充容器名或容器 ID。"
      };
    }

    const resolution = await this.resolveContainer(parsed.target);
    if (resolution.type === "missing") {
      return {
        needsConfirmation: false,
        mode: "clarify",
        parsed,
        summary: `没有找到容器 ${parsed.target}`
      };
    }

    if (resolution.type === "ambiguous") {
      return {
        needsConfirmation: false,
        mode: "clarify",
        parsed,
        summary: `匹配到多个容器，请说得更具体一些：${resolution.candidates
          .map((item: ContainerSummary) => item.names[0] || item.id)
          .join(", ")}`,
        candidates: resolution.candidates
      };
    }

    const target = resolution.container;
    if (this.requiresConfirmation(parsed) && !confirm) {
      return {
        needsConfirmation: true,
        mode: "preview",
        parsed,
        target,
        summary: this.buildPreviewMessage(parsed, target)
      };
    }

    return this.executeSingleContainerCommand(parsed, target);
  }

  private validatePrompt(prompt: string) {
    if (!prompt || !prompt.trim()) {
      throw new BadRequestException("prompt is required");
    }

    return prompt.trim();
  }

  private async generateText(prompt: string) {
    const res = await axios.post(`${this.ollamaBaseUrl}/api/generate`, {
      model: this.model,
      prompt,
      stream: false
    });

    return res.data?.response ?? "";
  }

  private async parseCommand(prompt: string): Promise<ParsedCommand> {
    const fallback = this.fallbackParseCommand(prompt);
    if (fallback.action !== "unknown") {
      return fallback;
    }

    try {
      const aiPrompt = [
        "You are a Docker assistant that converts a user request into JSON.",
        "Allowed actions: list_containers, stop_container, start_container, restart_container, get_logs, unknown.",
        "Return exactly one JSON object. No markdown. No explanation.",
        'JSON schema: {"action":"unknown","target":null,"scope":"single","tail":100}',
        "Rules:",
        "1. If the user wants to list containers, action=list_containers.",
        "2. If the user wants to stop or close a container, action=stop_container.",
        "3. If the user wants to start a container, action=start_container.",
        "4. If the user wants to restart a container, action=restart_container.",
        "5. If the user wants logs, action=get_logs and tail is the number of log lines, default 100.",
        "6. scope can be all only when the user explicitly says all containers.",
        "7. target must be a container name or id. Use null if not provided.",
        "8. If the user wants to stop Docker Engine, Docker Desktop, or any system-level Docker service, return unknown.",
        `User request: ${prompt}`
      ].join("\n");

      const raw = await this.generateText(aiPrompt);
      const parsed = this.extractCommandFromText(raw);
      if (parsed && parsed.action !== "unknown") {
        return parsed;
      }
    } catch (error: any) {
      this.logger.warn(
        `AI command parser failed, fallback to rules: ${
          error?.message || "unknown error"
        }`
      );
    }

    return fallback;
  }

  private extractCommandFromText(text: string): ParsedCommand | null {
    if (!text) {
      return null;
    }

    const jsonText = this.extractJsonBlock(text);
    if (!jsonText) {
      return null;
    }

    try {
      const parsed = JSON.parse(jsonText);
      return this.normalizeParsedCommand(parsed);
    } catch {
      return null;
    }
  }

  private extractJsonBlock(text: string) {
    const fencedMatch = text.match(/```json\s*([\s\S]*?)```/i);
    if (fencedMatch?.[1]) {
      return fencedMatch[1].trim();
    }

    const objectMatch = text.match(/\{[\s\S]*\}/);
    return objectMatch?.[0]?.trim() || null;
  }

  private normalizeParsedCommand(input: any): ParsedCommand {
    const actionMap: Record<string, CommandAction> = {
      list_containers: "list_containers",
      stop_container: "stop_container",
      start_container: "start_container",
      restart_container: "restart_container",
      get_logs: "get_logs",
      unknown: "unknown"
    };

    const action = actionMap[String(input?.action || "").trim()] || "unknown";
    const scope = input?.scope === "all" ? "all" : "single";
    const target =
      typeof input?.target === "string" && input.target.trim()
        ? input.target.trim()
        : null;

    let tail = Number.parseInt(String(input?.tail ?? 100), 10);
    if (!Number.isFinite(tail) || tail <= 0) {
      tail = 100;
    }
    tail = Math.min(tail, 500);

    return { action, target, scope, tail };
  }

  private fallbackParseCommand(prompt: string): ParsedCommand {
    const text = prompt.trim();
    const lower = text.toLowerCase();
    const hasAllScope =
      /(\u6240\u6709|\u5168\u90e8|\ball\b)/i.test(text) &&
      !/\u6240\u6709\u65e5\u5fd7/.test(text);
    const scope: "single" | "all" =
      hasAllScope ? "all" : "single";
    const tailMatch = text.match(/(\d+)\s*(\u884c|\u6761|lines?)/i);
    const tail = tailMatch
      ? Math.min(Math.max(Number.parseInt(tailMatch[1], 10), 1), 500)
      : 100;

    if (/(\u65e5\u5fd7|\blog\b)/i.test(text)) {
      return {
        action: "get_logs",
        target: this.extractTarget(text),
        scope,
        tail
      };
    }

    if (
      /(\u505c\u6b62|\u5173\u95ed|\u505c\u6389|\bstop\b)/i.test(text) &&
      /(docker desktop|docker engine)/i.test(lower)
    ) {
      return { action: "unknown", target: null, scope: "single", tail };
    }

    if (/(\u505c\u6b62|\u5173\u95ed|\u505c\u6389|\bstop\b)/i.test(text)) {
      return {
        action: "stop_container",
        target: scope === "all" ? null : this.extractTarget(text),
        scope,
        tail
      };
    }

    if (/(\u542f\u52a8|\u5f00\u542f|\u8fd0\u884c|\bstart\b)/i.test(text)) {
      return {
        action: "start_container",
        target: scope === "all" ? null : this.extractTarget(text),
        scope,
        tail
      };
    }

    if (/(\u91cd\u542f|\brestart\b)/i.test(text)) {
      return {
        action: "restart_container",
        target: scope === "all" ? null : this.extractTarget(text),
        scope,
        tail
      };
    }

    if (
      /(\u5217\u8868|\u5217\u51fa|\u67e5\u770b).*(\u5bb9\u5668)/i.test(text) ||
      /\b(list|show)\b.*\bcontainers?\b/i.test(text) ||
      /^(\u5bb9\u5668|containers?)$/i.test(text)
    ) {
      return { action: "list_containers", target: null, scope: "single", tail };
    }

    return { action: "unknown", target: null, scope: "single", tail };
  }

  private extractTarget(prompt: string) {
    const quoted = prompt.match(/["“'`](.+?)["”'`]/);
    if (quoted?.[1]) {
      return quoted[1].trim();
    }

    const reservedWords = new Set([
      "stop",
      "start",
      "restart",
      "show",
      "get",
      "list",
      "container",
      "containers",
      "docker",
      "logs",
      "log"
    ]);

    const trailingLabel = prompt.match(
      /([A-Za-z0-9][\w.-]*)\s*(?:\u5bb9\u5668|container)\b/i
    );
    if (
      trailingLabel?.[1] &&
      !reservedWords.has(trailingLabel[1].trim().toLowerCase())
    ) {
      return trailingLabel[1].trim();
    }

    const labeled = prompt.match(
      /(?:\u5bb9\u5668|container)\s*[:：]?\s*([A-Za-z0-9][\w.-]*)/i
    );
    if (labeled?.[1]) {
      return labeled[1].trim();
    }

    const englishActionMatch = prompt.match(
      /\b(?:stop|start|restart|show|get)\b\s+(?:container\s+)?([A-Za-z0-9][\w.-]*)/i
    );
    if (
      englishActionMatch?.[1] &&
      !reservedWords.has(englishActionMatch[1].trim().toLowerCase())
    ) {
      return englishActionMatch[1].trim();
    }

    const actionMatch = prompt.match(
      /(?:\u505c\u6b62|\u5173\u95ed|\u505c\u6389|\u542f\u52a8|\u5f00\u542f|\u8fd0\u884c|\u91cd\u542f|\u67e5\u770b|\u83b7\u53d6|\u67e5\u8be2)\s*(?:\u4e00\u4e0b|\u4e0b|\u5bb9\u5668|container|\u7684|\u65e5\u5fd7|logs?)?\s*([A-Za-z0-9][\w.-]*)/i
    );
    if (actionMatch?.[1]) {
      const value = actionMatch[1].trim();
      if (!/^(docker|containers?|logs?)$/i.test(value)) {
        return value;
      }
    }

    return null;
  }

  private async handleAllContainerCommand(
    parsed: ParsedCommand,
    confirm: boolean
  ) {
    if (
      parsed.action !== "stop_container" &&
      parsed.action !== "start_container" &&
      parsed.action !== "restart_container"
    ) {
      return {
        needsConfirmation: false,
        mode: "clarify",
        parsed,
        summary: "当前只支持对所有容器执行启动、停止或重启。"
      };
    }

    const containers = await this.dockerService.listContainers(true);
    const candidates = containers
      .filter((item: any) =>
        this.matchesAllScopeAction(parsed.action, item.State)
      )
      .map((item: any) => this.toContainerSummary(item));

    if (!candidates.length) {
      return {
        needsConfirmation: false,
        mode: "executed",
        parsed,
        summary: "没有需要处理的容器。",
        result: { containers: [] }
      };
    }

    if (!confirm) {
      return {
        needsConfirmation: true,
        mode: "preview",
        parsed,
        summary: `将对 ${candidates.length} 个容器执行 ${this.actionLabel(
          parsed.action
        )}，如确认请传 confirm=true。`,
        candidates
      };
    }

    for (const item of candidates) {
      await this.executeAction(parsed.action, item.id);
    }

    return {
      needsConfirmation: false,
      mode: "executed",
      parsed,
      summary: `已对 ${candidates.length} 个容器执行 ${this.actionLabel(
        parsed.action
      )}`,
      result: { containers: candidates }
    };
  }

  private matchesAllScopeAction(action: CommandAction, state: string) {
    if (action === "stop_container" || action === "restart_container") {
      return state === "running";
    }

    if (action === "start_container") {
      return state !== "running";
    }

    return false;
  }

  private async resolveContainer(target: string) {
    const containers = await this.dockerService.listContainers(true);
    const normalizedTarget = this.normalizeValue(target);

    const exactMatches = containers.filter((item: any) => {
      const names = (item.Names || []).map((name: string) =>
        this.normalizeValue(name)
      );
      return (
        this.normalizeValue(item.Id).startsWith(normalizedTarget) ||
        names.includes(normalizedTarget)
      );
    });

    if (exactMatches.length === 1) {
      return {
        type: "single" as const,
        container: this.toContainerSummary(exactMatches[0])
      };
    }

    const partialMatches = containers.filter((item: any) => {
      const names = (item.Names || []).map((name: string) =>
        this.normalizeValue(name)
      );
      return (
        this.normalizeValue(item.Id).includes(normalizedTarget) ||
        names.some((name: string) => name.includes(normalizedTarget))
      );
    });

    if (partialMatches.length === 1) {
      return {
        type: "single" as const,
        container: this.toContainerSummary(partialMatches[0])
      };
    }

    if (partialMatches.length > 1) {
      return {
        type: "ambiguous" as const,
        candidates: partialMatches.map((item: any) =>
          this.toContainerSummary(item)
        )
      };
    }

    return { type: "missing" as const };
  }

  private normalizeValue(value: string) {
    return value.replace(/^\//, "").trim().toLowerCase();
  }

  private toContainerSummary(item: any): ContainerSummary {
    return {
      id: String(item.Id || "").slice(0, 12),
      names: Array.isArray(item.Names)
        ? item.Names.map((name: string) => name.replace(/^\//, ""))
        : [],
      image: item.Image || "",
      state: item.State || "",
      status: item.Status || ""
    };
  }

  private requiresConfirmation(parsed: ParsedCommand) {
    return (
      parsed.scope === "all" ||
      parsed.action === "stop_container" ||
      parsed.action === "restart_container"
    );
  }

  private buildPreviewMessage(
    parsed: ParsedCommand,
    target: ContainerSummary
  ) {
    return `将对容器 ${target.names[0] || target.id} 执行 ${this.actionLabel(
      parsed.action
    )}，如确认请传 confirm=true。`;
  }

  private async executeSingleContainerCommand(
    parsed: ParsedCommand,
    target: ContainerSummary
  ) {
    if (parsed.action === "get_logs") {
      const logs = await this.dockerService.getContainerLogs(target.id, parsed.tail);
      return {
        needsConfirmation: false,
        mode: "executed",
        parsed,
        target,
        summary: `已获取容器 ${target.names[0] || target.id} 的最近 ${parsed.tail} 行日志`,
        result: { logs, tail: parsed.tail }
      };
    }

    await this.executeAction(parsed.action, target.id);

    return {
      needsConfirmation: false,
      mode: "executed",
      parsed,
      target,
      summary: `已对容器 ${target.names[0] || target.id} 执行 ${this.actionLabel(
        parsed.action
      )}`,
      result: { action: parsed.action, target }
    };
  }

  private async executeAction(action: CommandAction, id: string) {
    if (action === "stop_container") {
      await this.dockerService.stopContainer(id);
      return;
    }

    if (action === "start_container") {
      await this.dockerService.startContainer(id);
      return;
    }

    if (action === "restart_container") {
      await this.dockerService.restartContainer(id);
      return;
    }
  }

  private actionLabel(action: CommandAction) {
    switch (action) {
      case "stop_container":
        return "停止";
      case "start_container":
        return "启动";
      case "restart_container":
        return "重启";
      case "get_logs":
        return "查看日志";
      case "list_containers":
        return "查看容器列表";
      default:
        return "操作";
    }
  }
}
