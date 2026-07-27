import { Module } from "@nestjs/common";

/**
 * Domain module exports nothing injectable — it only holds
 * entity interfaces and port definitions used by other layers.
 */
@Module({})
export class DomainModule {}
