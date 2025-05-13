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

  async getAuctionFirstReport(startDate?: string) {
    let query = `SELECT * FROM "Trades" where DATE("TradeDate") = '${startDate}'`;
    console.log(query)
    const trades = await this.dataSource.query(query);
    const firstReport = await this.firstSummaryStatementReport(trades); // Первая ведомость
    return firstReport;
  }

  async firstSummaryStatementReport(trades) {
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
  
  async getAuctionSecondReport(startDate?: string) {
    let query = `SELECT * FROM "Trades" where DATE("TradeDate") = '${startDate}'`;
    console.log(query)
    const trades = await this.dataSource.query(query);
    const firstReport = await this.secondSummaryStatementReport(trades); // Первая ведомость
    const compare = await this.getAuctionComparisonReport(startDate, "2023-06-15");
    return {firstReport, compare};
  }

  
  // async secondSummaryStatementReport(trades) {
  //   const NOMINAL_PER_BOND = 100;
  
  //   const filterByKind = (kind: string) => trades.filter(t => t.Kind === kind);
  //   const sumQty = (arr) => arr.reduce((sum, t) => sum + Number(t.Qty), 0);
  //   const sumValue = (arr) => arr.reduce((sum, t) => sum + Number(t.Value), 0);
  
  //   const competitive = filterByKind("Обычная");
  //   const nonCompetitive = filterByKind("Неконкурентная");
  
  //   const compQty = sumQty(competitive);
  //   const nonCompQty = sumQty(nonCompetitive);
  
  //   const compNominal = compQty * NOMINAL_PER_BOND;
  //   const nonCompNominal = nonCompQty * NOMINAL_PER_BOND;
  
  //   const compActual = sumValue(competitive);
  //   const nonCompActual = sumValue(nonCompetitive);
  
  //   const totalQty = compQty + nonCompQty;
  //   const totalActual = compActual + nonCompActual;

  //   // Средневзвешенная цена
  //   const averagePrice = totalQty > 0
  //   ? trades.reduce((sum, t) => sum + Number(t.Price) * Number(t.Qty), 0) / totalQty
  //   : 0;

  //   // Средневзвешенная доходность
  //   const averageYield = totalQty > 0
  //     ? trades.reduce((sum, t) => sum + Number(t.Yield) * Number(t.Qty), 0) / totalQty
  //     : 0;
      
  //   return {
  //     competitive: {
  //       qty: compQty,
  //       nominal: compNominal,
  //       actual: compActual,
  //     },
  //     nonCompetitive: {
  //       qty: nonCompQty,
  //       nominal: nonCompNominal,
  //       actual: nonCompActual,
  //     },
  //     total: {
  //       qty: compQty + nonCompQty,
  //       nominal: compNominal + nonCompNominal,
  //       actual: totalActual,
  //     },
  //     averagePrice: Number(averagePrice.toFixed(2)),
  //     averageYield: Number(averageYield.toFixed(2)),
  //   };
  // }

  async secondSummaryStatementReport(trades) {
  const NOMINAL_PER_BOND = 100;

  // фильтруем конкурентные/неконкурентные
  const competitive = trades.filter(t => t.Kind === "Обычная");
  const nonCompetitive = trades.filter(t => t.Kind === "Неконкурентная");

  // суммы по штукам и факту
  const sumQty = arr => arr.reduce((s, t) => s + Number(t.Qty), 0);
  const sumValue = arr => arr.reduce((s, t) => s + Number(t.Value), 0);

  const compQty = sumQty(competitive);
  const nonCompQty = sumQty(nonCompetitive);
  const compActual = sumValue(competitive);
  const nonCompActual = sumValue(nonCompetitive);

  // Всего
  const totalQty = compQty + nonCompQty;
  const totalActual = compActual + nonCompActual;
  const totalNominal = totalQty * NOMINAL_PER_BOND; // по номиналу

  // Средневзвешенные
  const avgPrice = totalQty
    ? trades.reduce((s, t) => s + Number(t.Price) * Number(t.Qty), 0) / totalQty
    : 0;
  const avgYield = totalQty
    ? trades.reduce((s, t) => s + Number(t.Yield) * Number(t.Qty), 0) / totalQty
    : 0;

  // Макс./минимальная цена и доходности на ней
  const prices = trades.map(t => Number(t.Price));
  const maxPrice = Math.max(...prices);
  const cutOffPrice = Math.min(...prices);
  const yieldAtMax = trades.find(t => Number(t.Price) === maxPrice)?.Yield ?? 0;
  const yieldAtCutOff = trades.find(t => Number(t.Price) === cutOffPrice)?.Yield ?? 0;

  return {
    // итоговые объёмы в сомах
    demandNominal: totalNominal,     // объём спроса (по номиналу)
    placementNominal: totalNominal,  // объём размещения (по номиналу) — в нашем массиве исполненных совпадает
    actualPlacement: totalActual,    // объём размещения фактически

    averagePrice: Number(avgPrice.toFixed(2)),      // средневзвешенная цена
    averageYield: Number(avgYield.toFixed(2)),      // средневзвешенная доходность

    maxPrice: Number(maxPrice.toFixed(2)),          // максимальная цена
    yieldAtMaxPrice: Number(Number(yieldAtMax).toFixed(2)),   // доходность по макс. цене

    cutOffPrice: Number(cutOffPrice.toFixed(2)),    // цена отсечения
    yieldAtCutOff: Number(Number(yieldAtCutOff).toFixed(2)), // доходность по цене отсечения
  };
}
/**
 * Сравнивает два аукциона: текущий и предыдущий.
 * @param currentDate  — дата текущего аукциона (YYYY-MM-DD)
 * @param prevDate     — дата предыдущего аукциона
 */
async getAuctionComparisonReport(currentDate: string, prevDate: string) {
  const NOMINAL_PER_BOND = 100;

  // 1) Вытащили сделки по двум датам
  const sql = (date: string) =>
    `SELECT * FROM "Trades" WHERE DATE("TradeDate") = '${date}'`;
  const [tradesCurr, tradesPrev] = await Promise.all([
    this.dataSource.query(sql(currentDate)),
    this.dataSource.query(sql(prevDate)),
  ]);

  // 2) Общая функция для подсчёта метрик по одному аукциону
  const calcMetrics = (trades: any[]) => {
    // конкурентные + неконкурентные (но для offerVolume нам нужны ВСЕ "Продажа")
    const sumQtyByOp = (op: string) =>
      trades.filter(t => t.Operation === op)
            .reduce((sum, t) => sum + Number(t.Qty), 0);

    // 2.a) Объём предложения = все продажи по номиналу
    const offerQty = sumQtyByOp("Продажа");
    const offerVolume = (offerQty * NOMINAL_PER_BOND) / 1000; // в тыс. сомов

    // 2.b) Объём спроса (по номиналу): все приходы покупок
    const demandQty = sumQtyByOp("Купля");
    const demandVolume = (demandQty * NOMINAL_PER_BOND) / 1000;

    // 2.c) Объём размещения (по номиналу) — в аукционе всё, что покупают, сразу размещается
    const placementVolume = demandVolume;

    // 2.d) Средневзвешенная цена и доходность
    const totalQty = trades.reduce((s, t) => s + Number(t.Qty), 0);
    const totalValue = trades.reduce((s, t) => s + Number(t.Value), 0);
    const averagePrice = totalQty
      ? trades.reduce((s, t) => s + Number(t.Price) * Number(t.Qty), 0) / totalQty
      : 0;
    const averageYield = totalQty
      ? trades.reduce((s, t) => s + Number(t.Yield) * Number(t.Qty), 0) / totalQty
      : 0;

    // 2.e) Макс/мин-цена и доходности на них
    const prices = trades.map(t => Number(t.Price));
    const maxPrice = Math.max(...prices);
    const cutOffPrice = Math.min(...prices);
    const yieldAtMax = trades.find(t => Number(t.Price) === maxPrice)?.Yield ?? 0;
    const yieldAtCutOff = trades.find(t => Number(t.Price) === cutOffPrice)?.Yield ?? 0;

    return {
      offerVolume: Number(offerVolume.toFixed(2)),
      demandVolume: Number(demandVolume.toFixed(2)),
      placementVolume: Number(placementVolume.toFixed(2)),
      averagePrice: Number(averagePrice.toFixed(2)),
      averageYield: Number(averageYield.toFixed(2)),
      maxPrice: Number(maxPrice.toFixed(2)),
      yieldAtMaxPrice: Number(Number(yieldAtMax).toFixed(2)),
      cutOffPrice: Number(cutOffPrice.toFixed(2)),
      yieldAtCutOff: Number(Number(yieldAtCutOff).toFixed(2)),
    };
  };

  // 3) Считаем метрики для текущего и предыдущего
  const current = calcMetrics(tradesCurr);
  const previous = calcMetrics(tradesPrev);

  // 4) Вычисляем абсолютную разницу
  const difference: Record<string, number> = {};
  Object.keys(current).forEach(key => {
    // @ts-ignore
    difference[key] = Number((current[key] - previous[key]).toFixed(2));
  });

  return { current, previous, difference };
}
async getDepositoryReport(date: string) {
  // 1. Вытащить все сделки за дату
  const sql = `SELECT * FROM "Trades" WHERE DATE("TradeDate") = '${date}'`;
  const trades: any[] = await this.dataSource.query(sql);
  if (!trades.length) return null;

  // 2. Общая информация по аукциону
  const registrationNumber = trades[0].SecCode;               // Регистрационный номер
  const auctionDate = new Date(trades[0].TradeDate).toISOString().split('T')[0];
  
  // Считаем суммарный номинал (issue volume) и неконкурентный объём
  const NOMINAL_PER_BOND = 100;
  const sumQty = (arr: any[]) => arr.reduce((s, t) => s + Number(t.Qty), 0);

  const allSales = trades.filter(t => t.Operation === 'Продажа');
  const nonCompSales = allSales.filter(t => t.Kind === 'Неконкурентная');

  const issueQty = sumQty(allSales);
  const nonCompQty = sumQty(nonCompSales);

  const issueVolume = issueQty * NOMINAL_PER_BOND;   // в сомах
  const nonCompVolume = nonCompQty * NOMINAL_PER_BOND;

  // 3. Детализация по дилерам (группировка по покупателю — CPFirmName)
  // interface DealerRow { 
  //   dealer: string; 
  //   qty: number; 
  //   actual: number; 
  //   price: number; 
  //   yield: number;
  // }
  // const byDealer = new Map<string, DealerRow>();
  const byDealer = new Map();

  for (const t of allSales) {
    const name = t.CPFirmName || '—';
    const qty = Number(t.Qty);
    const actual = Number(t.Value);
    const price = Number(t.Price);
    const yld   = Number(t.Yield);

    if (!byDealer.has(name)) {
      byDealer.set(name, { dealer: name, qty, actual, price, yield: yld });
    } else {
      const row = byDealer.get(name)!;
      row.qty    += qty;
      row.actual += actual;
      // price и yield оставляем из первого лота
    }
  }

  const dealerRows = Array.from(byDealer.values());
  const totalQty    = dealerRows.reduce((s, r) => s + r.qty, 0);
  const totalActual = dealerRows.reduce((s, r) => s + r.actual, 0);

  // 4. Собираем итоговый объект
  return {
    general: {
      registrationNumber,          // Рег. номер
      auctionDate,                 // Дата аукциона
      issueVolume: issueVolume,    // Объем выпуска (сом)
      nonCompVolume,               // в т.ч. неконкурентные на сумму (сом)
    },
    details: [
      ...dealerRows,
      // {                            // итоговая строка
      //   dealer: 'Итого:',
      //   qty: totalQty,
      //   actual: totalActual,
      //   price: dealerRows[0]?.price ?? 0,
      //   yield: dealerRows[0]?.yield ?? 0
      // }
    ]
  };
}
async getClassificationReport(date: string) {
  // 1. Вытащить все сделки за дату
  const sql = `SELECT * FROM "Trades" WHERE DATE("TradeDate") = '${date}'`;
  const trades: any[] = await this.dataSource.query(sql);
  if (!trades.length) return null;

  // 2. Общая информация по аукциону
  const registrationNumber = trades[0].SecCode;
  const auctionDate = new Date(trades[0].TradeDate).toISOString().split('T')[0];

  // 3. Считаем объём выпуска и неконкурентные заявки
  const NOMINAL_PER_BOND = 100;
  const allSales = trades.filter(t => t.Operation === 'Продажа');
  const nonCompSales = allSales.filter(t => t.Kind === 'Неконкурентная');

  const sumQty = (arr: any[]) => arr.reduce((s, t) => s + Number(t.Qty), 0);
  const issueQty = sumQty(allSales);
  const nonCompQty = sumQty(nonCompSales);

  const issueVolume = issueQty * NOMINAL_PER_BOND;    // Объем выпуска (сом)
  const nonCompVolume = nonCompQty * NOMINAL_PER_BOND; // В т.ч. неконкурентные (сом)

  // 4. Группируем заявки по дилеру и считаем номинал
  // interface Row { dealer: string; nominal: number; price: number; yield: number }
  // const map = new Map<string, Row>();
  const map = new Map();

  for (const t of allSales) {
    const name = t.CPFirmName || '—';
    const qty = Number(t.Qty);
    const nominal = qty * NOMINAL_PER_BOND;
    const price = Number(t.Price);
    const yld   = Number(t.Yield);

    if (!map.has(name)) {
      map.set(name, { dealer: name, nominal, price, yield: yld });
    } else {
      map.get(name)!.nominal += nominal;
    }
  }

  const rows = Array.from(map.values());
  const totalNominal = rows.reduce((s, r) => s + r.nominal, 0);

  // 5. Собираем результирующий объект
  return {
    general: {
      registrationNumber, // Рег. номер
      auctionDate,        // Дата аукциона
      issueVolume,        // Объем выпуска (сом)
      nonCompVolume       // В т.ч. неконкурентные (сом)
    },
    details: [
      ...rows,
      // {                   // Итоговая строка
      //   dealer: 'Итого:',
      //   nominal: totalNominal,
      //   price: 0,
      //   yield: 0
      // }
    ]
  };
}

}
