import { SnowflakeService } from './snowflake.service';

// 测试雪花算法ID生成唯一性
function testSnowflakeUniqueness() {
  const snowflake = new SnowflakeService();
  const ids = new Set<string>();
  const testCount = 10000;
  const startTime = Date.now();

  console.log(`开始测试雪花算法，生成 ${testCount} 个ID...`);
  console.log(`机器ID: ${snowflake.getMachineId()}`);

  // 生成大量ID测试唯一性
  for (let i = 0; i < testCount; i++) {
    const id = snowflake.generateId();
    
    if (ids.has(id)) {
      console.error(`❌ 发现重复ID: ${id}`);
      console.error(`在第 ${i + 1} 次生成时发现重复`);
      return false;
    }
    
    ids.add(id);
    
    // 每1000个ID输出一次进度
    if ((i + 1) % 1000 === 0) {
      console.log(`已生成 ${i + 1} 个唯一ID`);
    }
  }

  const endTime = Date.now();
  const duration = endTime - startTime;
  const avgTime = duration / testCount;

  console.log(`\n✅ 测试完成！`);
  console.log(`生成 ${testCount} 个ID，全部唯一`);
  console.log(`总耗时: ${duration}ms`);
  console.log(`平均每个ID生成时间: ${avgTime.toFixed(4)}ms`);
  console.log(`生成速度: ${(testCount / duration * 1000).toFixed(0)} ID/秒`);

  // 显示一些示例ID
  const sampleIds = Array.from(ids).slice(0, 5);
  console.log(`\n示例ID:`);
  sampleIds.forEach((id, index) => {
    console.log(`${index + 1}. ${id}`);
    
    // 解析ID显示组成部分
    try {
      const parsed = snowflake.parseId(id);
      console.log(`   时间戳: ${parsed.timestamp}, 机器ID: ${parsed.machineId}, 序列号: ${parsed.sequence}`);
      console.log(`   生成时间: ${parsed.generatedAt.toISOString()}`);
    } catch (error) {
      console.log(`   解析失败: ${error.message}`);
    }
  });

  return true;
}

// 测试高并发场景
function testConcurrentGeneration() {
  const snowflake = new SnowflakeService();
  const ids = new Set<string>();
  const promises: Promise<string[]>[] = [];
  const concurrency = 10;
  const idsPerWorker = 1000;

  console.log(`\n开始并发测试，${concurrency} 个并发任务，每个生成 ${idsPerWorker} 个ID...`);

  // 创建多个并发任务
  for (let i = 0; i < concurrency; i++) {
    const promise = new Promise<string[]>((resolve) => {
      const workerIds: string[] = [];
      for (let j = 0; j < idsPerWorker; j++) {
        workerIds.push(snowflake.generateId());
      }
      resolve(workerIds);
    });
    promises.push(promise);
  }

  return Promise.all(promises).then((results) => {
    // 收集所有ID
    const allIds: string[] = [];
    results.forEach(workerIds => {
      allIds.push(...workerIds);
    });

    // 检查唯一性
    const uniqueIds = new Set(allIds);
    const totalIds = allIds.length;
    const uniqueCount = uniqueIds.size;

    console.log(`并发测试结果:`);
    console.log(`总生成ID数: ${totalIds}`);
    console.log(`唯一ID数: ${uniqueCount}`);
    console.log(`重复ID数: ${totalIds - uniqueCount}`);

    if (totalIds === uniqueCount) {
      console.log(`✅ 并发测试通过，所有ID都是唯一的`);
      return true;
    } else {
      console.log(`❌ 并发测试失败，发现重复ID`);
      return false;
    }
  });
}

// 运行测试
async function runTests() {
  console.log('='.repeat(50));
  console.log('雪花算法ID生成器测试');
  console.log('='.repeat(50));

  // 基础唯一性测试
  const basicTest = testSnowflakeUniqueness();
  
  if (basicTest) {
    // 并发测试
    const concurrentTest = await testConcurrentGeneration();
    
    if (concurrentTest) {
      console.log(`\n🎉 所有测试通过！雪花算法工作正常。`);
    } else {
      console.log(`\n❌ 并发测试失败！`);
    }
  } else {
    console.log(`\n❌ 基础测试失败！`);
  }
}

// 如果直接运行此文件
if (require.main === module) {
  runTests().catch(console.error);
}

export { testSnowflakeUniqueness, testConcurrentGeneration };