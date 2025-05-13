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

  @Get('auction/first')
  firstReportAuction(@Query() query: any) {
    return this.quikReportsService.getAuctionFirstReport(query.startDate);
  }

  @Get('auction/second')
  secondReportAuction(@Query() query: any) {
    return this.quikReportsService.getAuctionSecondReport(query.startDate);
  }

    @Get('auction/depo')
  getDepositoryReport(@Query() query: any) {
    return this.quikReportsService.getDepositoryReport(query.startDate);
  }

      @Get('auction/order')
  getClassificationReport(@Query() query: any) {
    return this.quikReportsService.getClassificationReport(query.startDate);
  }
}
