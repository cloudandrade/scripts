var exec = require('child_process').exec;

const DEFAULT_PORT = 3000;

function resolvePort(argv) {
	const portArg = argv.find((arg) => arg.startsWith('--port'));
	if (!portArg) {
		return DEFAULT_PORT;
	}

	const value = portArg.includes('=')
		? portArg.split('=')[1]
		: argv[argv.indexOf(portArg) + 1];

	const parsed = Number(value);
	if (!Number.isInteger(parsed) || parsed <= 0 || parsed > 65535) {
		console.log('\x1b[31m Porta inválida. Use --port=<número> (ex: --port=3001)');
		process.exit(1);
	}

	return parsed;
}

let port = resolvePort(process.argv.slice(2));
let commandlinefind = `netstat -a -n -o | findstr :${port}`;
let processid;
let pidChars = [];

let main = async () => {
	console.log(`\x1b[34m Porta alvo: ${port}`);
	await find();
};

let find = async () => {
	await exec(commandlinefind, async function(
		error,
		stdOut,
		stdErr
	) {
		console.log('\x1b[34m Buscando processos para a porta:');
		console.log('stdout: ' + stdOut);

		if (stdErr) {
			console.log('\x1b[31m stdErr: ' + stdErr);
		}

		for (let i = 0; i < stdOut.length; i++) {
			if (i > 70 && i < 76) {
				await pidChars.push(stdOut[i]);
			}
		}

		processid =
			pidChars[0] +
			pidChars[1] +
			pidChars[2] +
			pidChars[3] +
			pidChars[4];

		kill(processid);
	});

	return processid;
};

let kill = async processid => {
	if (processid) {
		console.log('\x1b[1;33m Filtrando processos...');
		await exec(`tskill ${processid}`, function(
			error,
			stdOut,
			stdErr
		) {
			console.log('\x1b[0;32m .. .');
			console.log(
				` Porta Liberada, o processo ${processid} ocupando a porta ${port} foi finalizado`
			);
			if (stdErr) {
				console.log('\x1b[31m stdErr: ' + stdErr);
			}
		});
	} else {
		console.log(
			'\x1b[34m Não foi encontrado nenhum processo usando esta porta!'
		);
	}
};

main();