import { Module } from "@nestjs/common";
import { DockerModule } from "../docker/docker.module";
import { AiService } from "./ai.service";
import { AiController } from "./ai.controller";

@Module({
  imports: [DockerModule],
  controllers: [AiController],
  providers: [AiService],
  exports: [AiService]
})
export class AiModule {}
