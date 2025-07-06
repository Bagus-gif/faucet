const { ethers } = require('ethers');
const fs = require('fs');
const readline = require('readline');
const chalk = require('chalk');

const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
});

function showBanner() {
    console.log(chalk.cyan(`
    ***********************************************
    ************ EVM Bulk Send v1.0.5 *************
    ***********************************************
    Created by github.com/baihaqism
    Modified: Auto 98% balance distribution
    ***********************************************
    `));
}

async function distributeEth(privateKeys, provider, addresses) {
    console.log(chalk.yellow('\n?? Starting automatic 98% balance transfer to target addresses...\n'));

    for (let i = 0; i < privateKeys.length; i++) {
        const wallet = new ethers.Wallet(privateKeys[i], provider);
        const senderAddress = wallet.address;

        console.log(chalk.cyan(`?? Using wallet ${senderAddress} for transfers.`));

        // Ambil nonce untuk wallet saat ini
        let nonce = await provider.getTransactionCount(senderAddress, "latest");

        // Periksa saldo awal
        let balance = await provider.getBalance(senderAddress);
        console.log(chalk.yellow(`?? Initial Balance: ${ethers.formatEther(balance)} ETH`));

        if (balance === 0n) {
            console.log(chalk.red(`? Wallet ${senderAddress} has zero balance. Skipping...\n`));
            continue;
        }

        // Hitung gas fee terlebih dahulu
        const gasPrice = await provider.getFeeData().then(feeData => feeData.gasPrice);
        const estimatedGas = 21000n;
        const totalGasCost = estimatedGas * gasPrice * BigInt(addresses.length);

        // Periksa apakah saldo cukup untuk gas
        if (balance <= totalGasCost) {
            console.log(chalk.red(`? Insufficient balance for gas fees in ${senderAddress}. Skipping...\n`));
            continue;
        }

        // Hitung 98% dari saldo setelah dikurangi gas
        const availableBalance = balance - totalGasCost;
        const totalToSend = (availableBalance * 98n) / 100n;
        const amountPerAddress = totalToSend / BigInt(addresses.length);

        console.log(chalk.blue(`?? Total gas cost: ${ethers.formatEther(totalGasCost)} ETH`));
        console.log(chalk.blue(`?? Available balance after gas: ${ethers.formatEther(availableBalance)} ETH`));
        console.log(chalk.blue(`?? 98% to distribute: ${ethers.formatEther(totalToSend)} ETH`));
        console.log(chalk.blue(`?? Amount per address: ${ethers.formatEther(amountPerAddress)} ETH\n`));

        if (amountPerAddress === 0n) {
            console.log(chalk.red(`? Amount per address is too small in ${senderAddress}. Skipping...\n`));
            continue;
        }

        for (let j = 0; j < addresses.length; j++) {
            try {
                if (!ethers.isAddress(addresses[j])) {
                    console.log(chalk.red(`? Invalid address: ${addresses[j]}. Skipping...`));
                    continue;
                }

                const tx = await wallet.sendTransaction({
                    to: addresses[j],
                    value: amountPerAddress,
                    gasLimit: estimatedGas,
                    gasPrice,
                    nonce
                });

                console.log(chalk.green(`? Sent ${ethers.formatEther(amountPerAddress)} ETH from ${senderAddress} to ${addresses[j]}`));
                console.log(chalk.gray(`?? Transaction hash: ${tx.hash}\n`));

                await tx.wait(); // Tunggu transaksi selesai
                nonce++; // Tingkatkan nonce untuk transaksi berikutnya

            } catch (error) {
                console.log(chalk.red(`? Error sending from ${senderAddress} to ${addresses[j]}: ${error.message}\n`));
                continue;
            }
        }

        // Tampilkan saldo akhir
        const finalBalance = await provider.getBalance(senderAddress);
        console.log(chalk.yellow(`?? Final Balance: ${ethers.formatEther(finalBalance)} ETH\n`));
    }

    console.log(chalk.green('\n?? All automatic transfers complete!'));
}

async function main() {
    console.clear();
    showBanner();

    try {
        // Minta inputan RPC URL
        const rpcUrl = await new Promise((resolve) => {
            rl.question(chalk.green('\n?? Enter RPC URL: '), resolve);
        });

        const provider = new ethers.JsonRpcProvider(rpcUrl);

        // Baca private keys dari wallet.txt
        const privateKeys = fs.readFileSync('wallet.txt', 'utf8')
            .split('\n')
            .map(key => key.trim())
            .filter(key => {
                // Validasi: harus diawali "0x" dan panjang total 66 karakter (0x + 64 hex chars)
                return /^0x[a-fA-F0-9]{64}$/.test(key);
            });

        if (privateKeys.length === 0) {
            throw new Error('? No valid private keys found in wallet.txt');
        }

        console.log(chalk.cyan(`\n?? Found ${privateKeys.length} private keys`));
        
        // Periksa saldo setiap wallet
        let totalBalance = 0n;
        for (let i = 0; i < privateKeys.length; i++) {
            const wallet = new ethers.Wallet(privateKeys[i], provider);
            const balance = await provider.getBalance(wallet.address);
            totalBalance += balance;
            console.log(chalk.yellow(`Wallet ${i + 1} address: ${wallet.address}`));
            console.log(chalk.yellow(`Balance: ${ethers.formatEther(balance)} ETH\n`));
        }

        console.log(chalk.magenta(`?? Total Balance Across All Wallets: ${ethers.formatEther(totalBalance)} ETH`));

        // Baca target addresses dari target_addresses.txt
        const addresses = fs.readFileSync('target_addresses.txt', 'utf8')
            .split('\n')
            .map(addr => addr.trim())
            .filter(addr => ethers.isAddress(addr));

        if (addresses.length === 0) {
            throw new Error('? No valid addresses found in target_addresses.txt');
        }

        console.log(chalk.cyan(`\n?? Found ${addresses.length} valid target addresses`));
        console.log(chalk.yellow(`\n? Each wallet will automatically send 98% of its balance (after gas fees) distributed equally among all target addresses.`));

        // Konfirmasi sebelum melanjutkan
        const confirm = await new Promise((resolve) => {
            rl.question(chalk.green('\n? Do you want to proceed? (y/N): '), resolve);
        });

        if (confirm.toLowerCase() !== 'y' && confirm.toLowerCase() !== 'yes') {
            console.log(chalk.yellow('? Operation cancelled by user.'));
            return;
        }

        // Distribusikan ETH
        await distributeEth(privateKeys, provider, addresses);

    } catch (error) {
        console.log(chalk.red(`\n? Error: ${error.message}`));
    } finally {
        rl.close();
    }
}

main();