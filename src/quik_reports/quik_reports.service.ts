import { Injectable, Inject } from '@nestjs/common';
import { DataSource } from 'typeorm';

@Injectable()
export class QuikReportsService {
  constructor(private readonly dataSource: DataSource) {}


  async getReportF1(startDate?: string, endDate?: string) {
      let query = `
        SELECT
            "TradeNum",
            "TradeDateTime",
            "SettleDate",
            "ClientCode",  -- предполагаем, что это поле для покупателя
            "BrokerRef",    -- предполагаем, что это поле для продавца
            SUM("Qty"),
            AVG("Price"),
            SUM("Qty" * "Price"),
            "ClassName",
            "SecName"
        FROM
            "Trades"
        WHERE
            "ClassCode" = 'Corporate'  -- Пример фильтрации по рынку
            AND "Type" = 'Bond'        -- Пример фильтрации по типу ценной бумаги
        GROUP BY
            "TradeNum", "TradeDateTime", "SettleDate", "ClientCode", "BrokerRef", "ClassName", "SecName"
        ORDER BY
    "TradeDateTime" DESC;`;
      const params = [];
      const conditions = [];
      const result = await this.dataSource.query(query);
      return result.rows;
  }

  async getReportF9(startDate?: string, endDate?: string){
    let query = `
    SELECT
        "TradeNum",
        "SecName",
        "SecCode",  -- Здесь предполагаем, что SecCode является ISIN, если это не так, нужно заменить на правильное поле
        SUM("Qty"),
        SUM("Qty" * "Price"),
        "Account",  -- Предполагаем, что это поле
        "ClientCode"  -- Предполагаем, что это поле
    FROM
        "Trades"
    GROUP BY
        "TradeNum", "SecName", "SecCode", "Account", "ClientCode"  -- Группируем по наименованию и ISIN
    ORDER BY
    "SecName";
      `;
      // const params = [];
      // const conditions = [];
      // if (startDate && endDate) {
      //   conditions.push(`trade_date_time BETWEEN $${params.length + 1} AND $${params.length + 2}`);
      //   params.push(startDate, endDate);
      // }
      // if (conditions.length > 0) {
      //   query += ' WHERE ' + conditions.join(' AND ');
      // }
      // const result = await this.dataSource.query(query, params);
      const result = await this.dataSource.query(query);
      return result.rows;
  }

  async getAuctionReport(startDate?: string) {
    let query = `SELECT * FROM "Trades" where DATE("TradeDate") = '${startDate}'`;
    console.log(query)
    const result = await this.dataSource.query(query);
    const auction = await this.generateSummary(result);
    return auction
  }

  async generateSummary(trades) {
    const sales = trades.filter(t => t.Operation === "Продажа");
  
    if (sales.length === 0) return null;
  
    const firstTrade = sales[0];
    const nominalPerBond = 100; // Допустим, номинал одной облигации — 100 сом
  
    const totalQty = sales.reduce((sum, t) => sum + Number(t.Qty), 0);
    const totalValueActual = sales.reduce((sum, t) => sum + Number(t.Value), 0);
  
    const participantsSet = new Set();
    trades.forEach(t => {
      participantsSet.add(t.FirmName);
      participantsSet.add(t.CPFirmName);
    });
  
    const uniquePrices = {};
    sales.forEach(t => {
      const price = Number(t.Price);
      if (!uniquePrices[price]) {
        uniquePrices[price] = {
          price,
          nominal: 0,
          actual: 0,
          yield: Number(t.Yield),
        };
      }
      uniquePrices[price].nominal += Number(t.Qty) * nominalPerBond;
      uniquePrices[price].actual += Number(t.Value);
    });
  
    const pricesArray = Object.values(uniquePrices).map((p: any) => ({
      ...p,
      yieldByPrice: p.yield // можно изменить расчёт, если потребуется
    }));
  
    return {
      date: new Date(firstTrade.TradeDateTime).toISOString().split('T')[0],
      secCode: firstTrade.SecCode,
      registrationNumber: firstTrade.SecCode,
      totalQty,
      totalValueNominal: totalQty * nominalPerBond,
      totalValueActual,
      couponRate: null, // можно подставить, если есть справочник
      participants: participantsSet.size,
      institutionalInvestors: null, // не определяем пока
      financialInstitutes: null,
      residents: null,
      nonResidents: null,
      competitiveBids: {
        qty: totalQty,
        nominal: totalQty * nominalPerBond,
        actual: totalValueActual,
        percentFromTotal: "100%",
      },
      nonCompetitiveBids: {
        qty: 0,
        nominal: 0,
        actual: 0,
        percentFromTotal: "0%",
      },
      prices: pricesArray
    };
  }
  
}
