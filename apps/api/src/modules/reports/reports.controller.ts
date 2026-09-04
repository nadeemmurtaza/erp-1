import { Controller, Get, Query, Res } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import { RequirePermission } from '../../core/auth/decorators';
import { csvRow } from './csv.util';
import { ReportDateRangeQueryDto, StockReportQueryDto } from './dto/reports.dto';
import type { CsvExport } from './reports.service';
import { ReportsService } from './reports.service';

@ApiTags('admin/reports')
@Controller('admin/reports')
@RequirePermission('reports.view')
export class ReportsController {
  constructor(private readonly reports: ReportsService) {}

  @Get('export/orders')
  @ApiOperation({ summary: 'CSV: one row per order placed in the date range' })
  async exportOrders(
    @Query() query: ReportDateRangeQueryDto,
    @Res() response: Response,
  ): Promise<void> {
    this.stream(response, await this.reports.ordersCsv(query.from, query.to));
  }

  @Get('export/sales-by-day')
  @ApiOperation({ summary: 'CSV: order count and revenue per day in the date range' })
  async exportSalesByDay(
    @Query() query: ReportDateRangeQueryDto,
    @Res() response: Response,
  ): Promise<void> {
    this.stream(response, await this.reports.salesByDayCsv(query.from, query.to));
  }

  @Get('export/stitching-bookings')
  @ApiOperation({ summary: 'CSV: one row per bring-your-own-fabric booking in the date range' })
  async exportStitchingBookings(
    @Query() query: ReportDateRangeQueryDto,
    @Res() response: Response,
  ): Promise<void> {
    this.stream(response, await this.reports.stitchingBookingsCsv(query.from, query.to));
  }

  @Get('export/stock')
  @ApiOperation({ summary: 'CSV: current stock, one row per product variant' })
  async exportStock(
    @Query() query: StockReportQueryDto,
    @Res() response: Response,
  ): Promise<void> {
    this.stream(response, await this.reports.stockCsv(query.lowStockOnly === 'true'));
  }

  @Get('export/stock-valuation')
  @ApiOperation({ summary: 'CSV: stock valuation, one row per variant' })
  @RequirePermission('inventory.view_cost')
  async exportStockValuation(
    @Res() response: Response,
  ): Promise<void> {
    this.stream(response, await this.reports.stockValuationCsv());
  }

  @Get('export/purchases-by-supplier')
  @ApiOperation({ summary: 'CSV: purchases by supplier' })
  async exportPurchasesBySupplier(
    @Query() query: ReportDateRangeQueryDto,
    @Res() response: Response,
  ): Promise<void> {
    this.stream(response, await this.reports.purchasesBySupplierCsv(query.from, query.to));
  }

  @Get('export/stock-ledger')
  @ApiOperation({ summary: 'CSV: stock movement ledger' })
  async exportStockLedger(
    @Query() query: ReportDateRangeQueryDto,
    @Res() response: Response,
  ): Promise<void> {
    this.stream(response, await this.reports.stockLedgerCsv(query.from, query.to));
  }

  @Get('export/slow-movers')
  @ApiOperation({ summary: 'CSV: slow movers report' })
  async exportSlowMovers(
    @Res() response: Response,
  ): Promise<void> {
    this.stream(response, await this.reports.slowMoversCsv());
  }

  /** Writes the CSV a row at a time so a large export streams rather than buffering in memory. */
  private stream(response: Response, csv: CsvExport): void {
    response.setHeader('Content-Type', 'text/csv; charset=utf-8');
    response.setHeader('Content-Disposition', `attachment; filename="${csv.filename}"`);
    response.write(csvRow(csv.header));
    for (const row of csv.rows) {
      response.write(csvRow(row));
    }
    response.end();
  }
}

