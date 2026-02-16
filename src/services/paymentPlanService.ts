import { PaymentPlan, PaymentScheduleItem } from '../types';

export class PaymentPlanService {
  /**
   * Propose a payment plan based on outstanding balance
   */
  proposePaymentPlan(
    customerId: string,
    totalOutstanding: number,
    numberOfMonths: number = 6,
    interestRate: number = 0
  ): PaymentPlan {
    const monthlyPayment = totalOutstanding / numberOfMonths;
    const schedule: PaymentScheduleItem[] = [];

    for (let i = 0; i < numberOfMonths; i++) {
      const dueDate = new Date();
      dueDate.setMonth(dueDate.getMonth() + i + 1);
      
      schedule.push({
        dueDate: dueDate.toISOString().split('T')[0],
        amount: monthlyPayment,
        description: `Payment ${i + 1} of ${numberOfMonths}`,
      });
    }

    return {
      customerId,
      totalAmount: totalOutstanding,
      numberOfPayments: numberOfMonths,
      paymentSchedule: schedule,
      interestRate: interestRate > 0 ? interestRate : undefined,
    };
  }

  /**
   * Calculate payment plan with interest
   */
  proposePaymentPlanWithInterest(
    customerId: string,
    principal: number,
    monthlyInterestRate: number,
    numberOfMonths: number
  ): PaymentPlan {
    // Calculate monthly payment using amortization formula
    const monthlyPayment =
      (principal * monthlyInterestRate * Math.pow(1 + monthlyInterestRate, numberOfMonths)) /
      (Math.pow(1 + monthlyInterestRate, numberOfMonths) - 1);

    const schedule: PaymentScheduleItem[] = [];
    let remainingBalance = principal;

    for (let i = 0; i < numberOfMonths; i++) {
      const interestPayment = remainingBalance * monthlyInterestRate;
      const principalPayment = monthlyPayment - interestPayment;
      remainingBalance -= principalPayment;

      const dueDate = new Date();
      dueDate.setMonth(dueDate.getMonth() + i + 1);

      schedule.push({
        dueDate: dueDate.toISOString().split('T')[0],
        amount: monthlyPayment,
        description: `Payment ${i + 1} of ${numberOfMonths} (Principal: $${principalPayment.toFixed(2)}, Interest: $${interestPayment.toFixed(2)})`,
      });
    }

    return {
      customerId,
      totalAmount: monthlyPayment * numberOfMonths,
      numberOfPayments: numberOfMonths,
      paymentSchedule: schedule,
      interestRate: monthlyInterestRate * 12, // Annual rate
    };
  }

  /**
   * Format payment plan for email/communication
   */
  formatPaymentPlanForEmail(plan: PaymentPlan): string {
    let html = `
      <h3>Proposed Payment Plan</h3>
      <p><strong>Total Amount:</strong> $${plan.totalAmount.toFixed(2)}</p>
      <p><strong>Number of Payments:</strong> ${plan.numberOfPayments}</p>
    `;

    if (plan.interestRate && plan.interestRate > 0) {
      html += `<p><strong>Annual Interest Rate:</strong> ${(plan.interestRate * 100).toFixed(2)}%</p>`;
    }

    html += `
      <table style="border-collapse: collapse; width: 100%; margin-top: 20px;">
        <thead>
          <tr style="background-color: #f0f0f0;">
            <th style="border: 1px solid #ddd; padding: 8px; text-align: left;">Payment #</th>
            <th style="border: 1px solid #ddd; padding: 8px; text-align: left;">Due Date</th>
            <th style="border: 1px solid #ddd; padding: 8px; text-align: right;">Amount</th>
          </tr>
        </thead>
        <tbody>
    `;

    plan.paymentSchedule.forEach((payment, index) => {
      html += `
        <tr>
          <td style="border: 1px solid #ddd; padding: 8px;">${index + 1}</td>
          <td style="border: 1px solid #ddd; padding: 8px;">${payment.dueDate}</td>
          <td style="border: 1px solid #ddd; padding: 8px; text-align: right;">$${payment.amount.toFixed(2)}</td>
        </tr>
      `;
    });

    html += `
        </tbody>
      </table>
    `;

    return html;
  }
}
