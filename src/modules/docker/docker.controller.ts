import { Controller, Get, Post, Query, Body } from "@nestjs/common";
import { DockerService } from "./docker.service";
import { ContainerId } from "../../common/decorators/container-id.decorator";

@Controller("docker")
export class DockerController {
  constructor(private readonly dockerService: DockerService) {}

  @Get("status")
  async status() {
    return this.dockerService.checkConnection();
  }

  @Get("containers")
  async list(@Query("all") all?: string) {
    return this.dockerService.listContainers(all !== "false");
  }

  // POST /docker/start  body: { id }
  @Post("start")
  async start(@ContainerId() id: string) {
    return this.dockerService.startContainer(id);
  }

  // POST /docker/stop  body: { id }
  @Post("stop")
  async stop(@ContainerId() id: string) {
    return this.dockerService.stopContainer(id);
  }

  // POST /docker/restart  body: { id }
  @Post("restart")
  async restart(@ContainerId() id: string) {
    return this.dockerService.restartContainer(id);
  }

  // POST /docker/logs  body: { id, tail }
  @Post("logs")
  async logsByBody(@ContainerId() id: string, @Body("tail") tail?: number) {
    const tailNum = typeof tail === "number" ? tail : 100;
    return this.dockerService.getContainerLogs(id, tailNum);
  }
}
