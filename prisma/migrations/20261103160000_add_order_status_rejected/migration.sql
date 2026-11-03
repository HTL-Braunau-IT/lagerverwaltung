-- Worker-set "rejected" order status: order is left untouched and uneditable (#95).
ALTER TYPE "OrderStatus" ADD VALUE 'REJECTED';
