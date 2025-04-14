import { Controller, Get, Query } from '@nestjs/common';
import { QuikReportsService } from './quik_reports.service';

@Controller('quik-reports')
export class QuikReportsController {
  constructor(private readonly quikReportsService: QuikReportsService) {}

  // @Get('trade/last')
  // findAll() {
  //   return this.quikReportsService.getGroupedReportsByTradeDate();
  // }

  @Get('f1')
  findF1() {
    return this.quikReportsService.getReportF1();
  }

  @Get('auction')
  findAuction(@Query() query: any) {
    return this.quikReportsService.getAuctionReport(query.startDate);
  }
}
