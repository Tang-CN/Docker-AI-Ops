import { Module } from "@nestjs/common";
import { DockerModule } from "./modules/docker/docker.module";
import { AiModule } from "./modules/ai/ai.module";
import { WecomModule } from "./modules/wecom/wecom.module";

@Module({
  imports: [DockerModule, AiModule, WecomModule],
  controllers: [],
  providers: []
})
export class AppModule {}
