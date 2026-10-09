import { Injectable } from '@nestjs/common';
import type { MarketSourceType } from '../../prisma/client';
import { MarketHttpClient } from '../http/market-http-client';
import { AshbyConnector } from './ashby.connector';
import { GreenhouseConnector } from './greenhouse.connector';
import { LeverConnector } from './lever.connector';
import type { SourceConnector } from './source-connector';

@Injectable()
export class ConnectorRegistry {
  private readonly connectors = new Map<MarketSourceType, SourceConnector>();

  constructor(private readonly http: MarketHttpClient) {
    for (const c of [new GreenhouseConnector(), new LeverConnector(), new AshbyConnector()]) {
      this.connectors.set(c.type, c);
      this.http.allowHosts(c.hosts);
    }
  }

  get(type: MarketSourceType): SourceConnector {
    const connector = this.connectors.get(type);
    if (!connector) throw new Error(`No connector for ${type}`);
    return connector;
  }
}
