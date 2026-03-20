import { Controller, Post, Body } from "@nestjs/common";
import { AiService } from "./ai.service";

@Controller("ai")
export class AiController {
  constructor(private readonly aiService: AiService) {}

  @Post("analyze")
  async analyze(@Body("prompt") prompt: string) {
    return this.aiService.chat(prompt);
  }

  @Post("command")
  async command(
    @Body("prompt") prompt: string,
    @Body("confirm") confirm?: boolean | string
  ) {
    const confirmed = confirm === true || confirm === "true";
    return this.aiService.handleCommand(prompt, confirmed);
  }
}
