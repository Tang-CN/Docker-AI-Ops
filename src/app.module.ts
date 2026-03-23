import { Module } from "@nestjs/common";
import { DockerModule } from "./modules/docker/docker.module";
import { AiModule } from "./modules/ai/ai.module";

@Module({
  imports: [DockerModule, AiModule],
  controllers: [],
  providers: []
})
export class AppModule {}
