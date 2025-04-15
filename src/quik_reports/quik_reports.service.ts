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
    const nominalPerBond = 100; // номинал одной облигации
  
    const totalQty = sales.reduce((sum, t) => sum + Number(t.Qty), 0); // Всего штук
    const totalValueActual = sales.reduce((sum, t) => sum + Number(t.Value), 0); // Фактическая сумма размещения
    const totalValueNominal = totalQty * nominalPerBond; // Сумма по номиналу
  
    // Уникальные участники (покупатели и продавцы)
    const participantsSet = new Set();
    trades.forEach(t => {
      if (t.FirmName) participantsSet.add(t.FirmName);
      if (t.CPFirmName) participantsSet.add(t.CPFirmName);
    });
  
    // Конкурентные/неконкурентные заявки (Kind = "Обычная" → конкурентная, "Неконкурентная" → неконкурентная)
    const competitive = sales.filter(t => t.Kind === "Обычная");
    const nonCompetitive = sales.filter(t => t.Kind === "Неконкурентная");
  
    const compQty = competitive.reduce((sum, t) => sum + Number(t.Qty), 0);
    const compValue = competitive.reduce((sum, t) => sum + Number(t.Value), 0);
  
    const nonCompQty = nonCompetitive.reduce((sum, t) => sum + Number(t.Qty), 0);
    const nonCompValue = nonCompetitive.reduce((sum, t) => sum + Number(t.Value), 0);
  
    const uniquePrices = {};
    sales.forEach(t => {
      const price = Number(t.Price);
      if (!uniquePrices[price]) {
        uniquePrices[price] = {
          price,                                 // Цена размещения
          nominal: 0,                            // Сумма по номиналу
          actual: 0,                             // Сумма фактическая
          yield: Number(t.Yield),               // Доходность
        };
      }
      uniquePrices[price].nominal += Number(t.Qty) * nominalPerBond;
      uniquePrices[price].actual += Number(t.Value);
    });
  
    const pricesArray = Object.values(uniquePrices).map((p: any) => ({
      ...p,
      yieldByPrice: p.yield // Доходность по цене
    }));
  
    return {
      date: new Date(firstTrade.TradeDateTime).toISOString().split('T')[0],  // Дата проведения аукциона
      secCode: firstTrade.SecCode,                                           // Код ценной бумаги
      registrationNumber: firstTrade.SecCode,                                // Рег. номер выпуска
      totalQty,                                                              // Всего размещено (штук)
      totalValueNominal,                                                     // Сумма размещения по номиналу
      totalValueActual,                                                      // Сумма размещения фактическая
      couponRate: null,                                                      // Купонная ставка (если будет)
      participants: participantsSet.size,                                    // Кол-во участников
      institutionalInvestors: null,                                          // Институт. инвесторы
      financialInstitutes: null,                                             // Финансовые институты
      residents: null,                                                       // Резиденты
      nonResidents: null,                                                    // Нерезиденты
      competitiveBids: {
        qty: compQty,                                                        // Конкурентные заявки - количество
        nominal: compQty * nominalPerBond,                                   // по номиналу
        actual: compValue,                                                   // фактически
        percentFromTotal: ((compValue / totalValueActual) * 100).toFixed(2) + '%' // доля от общего
      },
      nonCompetitiveBids: {
        qty: nonCompQty,                                                     // Неконкурентные заявки - количество
        nominal: nonCompQty * nominalPerBond,
        actual: nonCompValue,
        percentFromTotal: ((nonCompValue / totalValueActual) * 100).toFixed(2) + '%'
      },
      prices: pricesArray                                                    // По каждой цене: цена, сумма по номиналу, фактическая, доходность
    };
  }
  
  
}
