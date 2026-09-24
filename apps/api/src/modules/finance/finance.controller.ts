import { BadRequestException, Body, Controller, Delete, Get, Param, Patch, Post, Query, UploadedFile, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBody, ApiConsumes, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser, RequirePermission } from '../../core/auth/decorators';
import { FinanceService } from './finance.service';
import { CreateExpenseCategoryDto, UpdateExpenseCategoryDto } from './dto/expense-category.dto';
import {
  CreateExpenseDto,
  ExpenseQueryDto,
  ExpenseSummaryQueryDto,
  MarginQueryDto,
  UnitEconomicsQueryDto,
  UpdateExpenseDto,
} from './dto/expense.dto';

/** Uploaded file as Multer hands it over — same shape catalog-admin.controller.ts uses. */
interface UploadedReceipt {
  buffer: Buffer;
  originalname: string;
  mimetype: string;
  size: number;
}

@ApiTags('Finance Admin')
@Controller('admin/finance')
export class FinanceController {
  constructor(private readonly finance: FinanceService) {}

  @Get('expense-categories')
  @RequirePermission('finance.view')
  @ApiOperation({ summary: 'List expense categories with their expense count' })
  async listCategories() {
    return { data: await this.finance.listCategories() };
  }

  @Post('expense-categories')
  @RequirePermission('finance.manage')
  @ApiOperation({ summary: 'Create an expense category' })
  async createCategory(@Body() dto: CreateExpenseCategoryDto) {
    return this.finance.createCategory(dto);
  }

  @Patch('expense-categories/:id')
  @RequirePermission('finance.manage')
  @ApiOperation({ summary: 'Rename, redirect or (de)activate an expense category' })
  async updateCategory(@Param('id') id: string, @Body() dto: UpdateExpenseCategoryDto) {
    return this.finance.updateCategory(id, dto);
  }

  @Delete('expense-categories/:id')
  @RequirePermission('finance.manage')
  @ApiOperation({ summary: 'Delete an unused expense category' })
  async deleteCategory(@Param('id') id: string) {
    await this.finance.deleteCategory(id);
    return { success: true };
  }

  @Get('expenses')
  @RequirePermission('finance.view')
  @ApiOperation({ summary: 'List expenses, paginated and filtered' })
  async listExpenses(@Query() query: ExpenseQueryDto) {
    return this.finance.listExpenses(query);
  }

  @Get('expenses/summary')
  @RequirePermission('finance.view')
  @ApiOperation({ summary: 'Totals, per-category breakdown and a daily series' })
  async summary(@Query() query: ExpenseSummaryQueryDto) {
    return this.finance.summary(query);
  }

  @Get('expenses/by-category')
  @RequirePermission('finance.view')
  @ApiOperation({ summary: 'Expense totals by category — share, period-over-period change, and share of revenue' })
  async byCategory(@Query() query: ExpenseSummaryQueryDto) {
    return this.finance.byCategory(query);
  }

  @Get('expenses/trend')
  @RequirePermission('finance.view')
  @ApiOperation({ summary: 'Expense totals over time, bucketed by day or month' })
  async trend(@Query() query: ExpenseSummaryQueryDto) {
    return this.finance.trend(query);
  }

  @Get('margins')
  @RequirePermission('finance.view')
  @ApiOperation({ summary: 'Margin by product, category or variant (WO-4.3, 04-finance.md)' })
  async margins(@Query() query: MarginQueryDto) {
    return this.finance.marginBy(query.groupBy ?? 'product', query);
  }

  @Get('unit-economics')
  @RequirePermission('finance.view')
  @ApiOperation({ summary: 'Contribution per order, paginated, plus the average by product/category (WO-4.2)' })
  async unitEconomics(@Query() query: UnitEconomicsQueryDto) {
    return this.finance.unitEconomics(query);
  }

  @Post('expenses')
  @RequirePermission('finance.manage')
  @ApiOperation({ summary: 'Record an expense' })
  async createExpense(@Body() dto: CreateExpenseDto, @CurrentUser('id') userId: string) {
    return this.finance.createExpense(dto, userId);
  }

  @Patch('expenses/:id')
  @RequirePermission('finance.manage')
  @ApiOperation({ summary: 'Edit an expense' })
  async updateExpense(@Param('id') id: string, @Body() dto: UpdateExpenseDto) {
    return this.finance.updateExpense(id, dto);
  }

  @Delete('expenses/:id')
  @RequirePermission('finance.manage')
  @ApiOperation({ summary: 'Delete an expense' })
  async deleteExpense(@Param('id') id: string) {
    await this.finance.deleteExpense(id);
    return { success: true };
  }

  @Post('expenses/:id/receipt')
  @RequirePermission('finance.manage')
  @ApiConsumes('multipart/form-data')
  @ApiBody({ schema: { type: 'object', properties: { file: { type: 'string', format: 'binary' } } } })
  @UseInterceptors(FileInterceptor('file'))
  @ApiOperation({ summary: 'Attach a receipt image or PDF to an expense' })
  async uploadReceipt(@Param('id') id: string, @UploadedFile() file: UploadedReceipt | undefined) {
    if (!file) throw new BadRequestException('Choose a receipt file to upload.');
    return this.finance.attachReceipt(id, file);
  }
}
