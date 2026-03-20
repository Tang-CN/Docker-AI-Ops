import { Injectable, Logger } from "@nestjs/common";
import Docker from "dockerode";

@Injectable()
export class DockerService {
  private docker: InstanceType<typeof Docker>;
  private logger = new Logger(DockerService.name);

  constructor() {
    this.docker = new Docker(); // 默认连接本机 Docker
  }

  async listContainers(all = true) {
    return this.docker.listContainers({ all });
  }

  async startContainer(id: string) {
    const container = this.docker.getContainer(id);
    return container.start();
  }

  async stopContainer(id: string) {
    const container = this.docker.getContainer(id);
    return container.stop();
  }

  async restartContainer(id: string) {
    const container = this.docker.getContainer(id);
    return container.restart();
  }

  async getContainerLogs(id: string, tail = 100) {
    const container = this.docker.getContainer(id);
    const stream = (await container.logs({
      stdout: true,
      stderr: true,
      tail: tail.toString()
    })) as Buffer;

    return this.decodeDockerLogStream(stream);
  }

  private decodeDockerLogStream(buffer: Buffer) {
    if (!buffer || buffer.length < 8) {
      return buffer?.toString() || "";
    }

    let offset = 0;
    let output = "";

    while (offset + 8 <= buffer.length) {
      const payloadSize = buffer.readUInt32BE(offset + 4);
      const start = offset + 8;
      const end = start + payloadSize;

      if (end > buffer.length) {
        return buffer.toString();
      }

      output += buffer.slice(start, end).toString();
      offset = end;
    }

    return output || buffer.toString();
  }

  // 检测 Docker 连接状态：ping + version + info，带超时保护
  async checkConnection(timeoutMs = 3000) {
    const pingAndInfo = async () => {
      // 一些 dockerode 版本没有 ping 方法，但通常有 version/info
      if (typeof (this.docker as any).ping === "function") {
        await (this.docker as any).ping();
      }
      const version = await (this.docker as any).version();
      const info = await (this.docker as any).info();
      return { ok: true, version, info };
    };

    const timer = new Promise((_, rej) =>
      setTimeout(() => rej(new Error("timeout")), timeoutMs)
    );

    try {
      return await Promise.race([pingAndInfo(), timer]);
    } catch (err: any) {
      this.logger.warn(
        "Docker connection failed: " + (err?.message || String(err))
      );
      return { ok: false, error: err?.message || String(err) };
    }
  }
}
